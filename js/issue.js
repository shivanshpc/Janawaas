// Issue detail page logic
// API_URL is defined in auth.js
let currentUser = null;
let currentIssue = null;
let issueMap = null;
// Prevent duplicate upvote requests
let upvoteInFlight = false;
let currentTracker = null;

const TRACKER_STAGE_SEQUENCE = [
    { key: 'planning', label: 'Devising a plan of action' },
    { key: 'permissions', label: 'Getting the necessary permissions' },
    { key: 'team_creation', label: 'Creating teams' },
    { key: 'physical_work', label: 'Physical working' },
    { key: 'completion', label: 'Issue completed' }
];

// Get issue ID from URL
function getIssueId() {
    const searchParams = new URLSearchParams(window.location.search);
    const queryId = searchParams.get('id');
    if (queryId) return queryId;

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    return pathParts[pathParts.length - 1];
}

function getCurrentUserId() {
    return currentUser?.id || currentUser?._id || null;
}

function getAssignedAuthorityUserId(issue) {
    const assigned = issue?.assignedAuthority;
    if (!assigned) return null;
    if (typeof assigned === 'string') return assigned;
    return assigned.userId?._id || assigned.userId || assigned._id || null;
}

function canCurrentAuthorityPostUpdates(issue) {
    const userId = getCurrentUserId();
    if (!userId || currentUser?.role !== 'authority') return false;

    const assignedUserId = getAssignedAuthorityUserId(issue);
    const statusAllowsProgress = issue?.status === 'accepted' || issue?.status === 'in_progress' || issue?.status === 'resolved';
    if (!assignedUserId) return statusAllowsProgress;

    const authorityOwnsIssue = assignedUserId.toString() === userId.toString();
    return authorityOwnsIssue && statusAllowsProgress;
}

// Initialize issue page
async function initIssuePage() {
    currentUser = await checkAuth();
    
    // Update navigation
    await updateNavigation();
    
    const issueId = getIssueId();
    await loadIssue(issueId);
    setupEventListeners();

    // Do not block the page on comments fetch; render progress and comments asynchronously.
    loadIssueUpdates(issueId);
    loadComments(issueId);
}

// Load issue details
async function loadIssue(issueId) {
    try {
        const headers = {};
        if (currentUser) {
            headers['Authorization'] = `Bearer ${getToken()}`;
        }

        const response = await fetch(`${API_URL}/issues/${issueId}`, { headers });

        if (!response.ok) throw new Error('Issue not found');

        const data = await response.json();
        currentIssue = data.issue;
        const hasUpvoted = data.hasUpvoted;
        
        displayIssue(currentIssue, hasUpvoted);
        
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('issueContent').style.display = 'block';
    } catch (error) {
        console.error('Error loading issue:', error);
        document.getElementById('loadingIndicator').innerHTML = 
            '<p class="error-message show">Failed to load issue. It may have been deleted.</p>';
    }
}

// Display issue details
function displayIssue(issue, hasUpvoted = false) {
    // Update page title
    document.title = `${issue.title} - JanAwaaz`;
    
    // Header
    document.getElementById('issueCategoryBadge').textContent = issue.category.toUpperCase();
    document.getElementById('issueTitle').textContent = issue.title;
    
    // Make author name clickable
    const authorElement = document.getElementById('issueAuthor');
    const authorName = issue.reportedBy?.displayName || issue.reportedBy?.name || 'Anonymous';
    const authorUsername = issue.reportedBy?.username;
    
    if (authorUsername) {
        authorElement.innerHTML = `By <a href="/profile/${authorUsername}" class="issue-author-link">${authorName}</a>`;
    } else {
        authorElement.textContent = `By ${authorName}`;
    }
    
    document.getElementById('issueDate').textContent = formatDate(issue.createdAt);
    document.getElementById('issueDistrict').textContent = issue.district;

    // Status
    const statusBadge = document.getElementById('issueStatus');
    statusBadge.textContent = issue.status.replace('-', ' ').toUpperCase();
    statusBadge.className = `status-badge status-${issue.status}`;

    // Images - Media Gallery
    const imagesContainer = document.getElementById('issueImages');
    if (issue.images && issue.images.length > 0) {
        imagesContainer.innerHTML = `
            <div class="media-gallery">
                ${issue.images.map((img, index) => `
                    <div class="media-gallery-item" onclick="openMediaModal(${index})">
                        <img src="${img.url}" alt="Issue media ${index + 1}" loading="lazy">
                    </div>
                `).join('')}
            </div>
        `;
        imagesContainer.style.display = 'block';
        
        // Store images globally for modal access
        window.currentIssueImages = issue.images;
    } else if (issue.mediaUrl) {
        // Fallback for old mediaUrl field
        imagesContainer.innerHTML = `
            <div class="media-gallery">
                <div class="media-gallery-item" onclick="openMediaModal(0)">
                    <img src="${issue.mediaUrl}" alt="Issue media" loading="lazy">
                </div>
            </div>
        `;
        imagesContainer.style.display = 'block';
        window.currentIssueImages = [{ url: issue.mediaUrl }];
    } else {
        imagesContainer.style.display = 'none';
        window.currentIssueImages = [];
    }

    // Description
    document.getElementById('issueDescription').textContent = issue.description;

    // Location
    if (issue.district && issue.state) {
        document.getElementById('issueAddress').textContent = `${issue.district}, ${issue.state}`;
    }

    // Collaboration Banner
    const collabBanner = document.getElementById('collaborationBanner');
    if (collabBanner) {
        if (issue.pendingMergeRequest && issue.pendingMergeRequest.status === 'accepted') {
            const fromAuth = issue.pendingMergeRequest.from;
            const toAuth = issue.pendingMergeRequest.to;
            const fromName = fromAuth?.userId?.displayName || fromAuth?.designation || 'Original Authority';
            const toName = toAuth?.userId?.displayName || toAuth?.designation || 'Collaborating Authority';
            
            collabBanner.innerHTML = `
                <div style="background: rgba(var(--primary-rgb), 0.1); border: 1px solid var(--primary-color); border-radius: 12px; padding: 16px; margin-bottom: 24px; display: flex; align-items: center; gap: 15px;">
                    <span style="font-size: 1.5rem;">🤝</span>
                    <div style="flex: 1;">
                        <h4 style="margin: 0; color: var(--primary-color);">Joint Collaboration</h4>
                        <p style="margin: 4px 0 0 0; font-size: 0.9rem; color: var(--text-secondary);">
                            This issue is being resolved collectively by <strong>${fromName}</strong> and <strong>${toName}</strong>.
                        </p>
                    </div>
                </div>
            `;
            collabBanner.style.display = 'block';
        } else {
            collabBanner.style.display = 'none';
        }
    }
    
    // Initialize map
    if (issue.latitude && issue.longitude) {
        setTimeout(() => {
            issueMap = initMap('issueMap', [issue.longitude, issue.latitude], 14);
            addMarker(issueMap, [issue.longitude, issue.latitude]);
        }, 300);
    }

    // Voting
    const upvoteBtn = document.getElementById('upvoteBtn');
    document.getElementById('upvoteCount').textContent = issue.upvoteCount;
    
    // Check if user is the creator of the issue
    const isCreator = currentUser && getCurrentUserId()?.toString() === issue.reportedBy?._id?.toString();
    
    if (!currentUser) {
        // Disable upvote button if not logged in
        upvoteBtn.disabled = true;
        upvoteBtn.classList.add('disabled');
        upvoteBtn.title = 'Please login to upvote';
    } else if (isCreator) {
        // Disable upvote button for issue creator
        upvoteBtn.disabled = true;
        upvoteBtn.classList.add('disabled');
        upvoteBtn.title = 'You cannot upvote your own issue';
    } else if (hasUpvoted) {
        upvoteBtn.classList.add('upvoted');
    }
    
    // Hide comment section if not logged in
    const commentForm = document.getElementById('addCommentForm');
    if (!currentUser && commentForm) {
        commentForm.innerHTML = '<p class="info-message">Please <a href="/login">login</a> to comment on this issue.</p>';
    }

    // Sidebar
    document.getElementById('sidebarStatus').textContent = issue.status.replace('-', ' ').toUpperCase();
    document.getElementById('sidebarCategory').textContent = issue.category.toUpperCase();
    document.getElementById('sidebarDistrict').textContent = issue.district;
    document.getElementById('sidebarDate').textContent = formatDate(issue.createdAt);

    // Severity (use severityScore from API if present)
    const severityEl = document.getElementById('severityValue');
    if (severityEl) {
        const score = (typeof issue.severityScore !== 'undefined') ? issue.severityScore : (issue.upvoteCount || 0);
        severityEl.textContent = score;
    }

    if (issue.assignedAuthority) {
        document.getElementById('assignedToItem').style.display = 'block';
        const assignedName = issue.assignedAuthority.name || issue.assignedAuthority.userId?.displayName || 'Assigned authority';
        document.getElementById('assignedTo').textContent = assignedName;
    }

    // Authority controls
    if (currentUser && currentUser.role === 'authority') {
        document.getElementById('authorityControls').style.display = 'block';
        document.getElementById('statusSelect').value = issue.status;
        
        // Hide quick actions if issue is not pending
        if (issue.status !== 'pending') {
            const quickActions = document.getElementById('quickActions');
            if (quickActions) quickActions.style.display = 'none';
        }

        // Hide merge button if issue is resolved
        const mergeAction = document.querySelector('.merge-action');
        if (mergeAction) {
            mergeAction.style.display = issue.status === 'resolved' ? 'none' : 'block';
        }

        const progressPanel = document.getElementById('progressUpdatePanel');
        const isAssignedAuthority = canCurrentAuthorityPostUpdates(issue);
        if (progressPanel) {
            progressPanel.style.display = isAssignedAuthority ? 'block' : 'none';
        }

        const draftPanel = document.getElementById('draftRemarksPanel');
        const draftText = document.getElementById('draftRemarksText');
        const publishBtn = document.getElementById('publishSuccessBtn');
        if (draftPanel && draftText) {
            if (isAssignedAuthority && issue.status === 'resolved' && !issue.publishedRemarks) {
                draftPanel.style.display = 'block';
                draftText.value = issue.draftRemarks || "";
                if (publishBtn) publishBtn.style.display = 'inline-block';
            } else {
                draftPanel.style.display = 'none';
            }
        }

        // Handle unmerge button
        const unmergeAction = document.getElementById('unmergeAction');
        const unmergeBtn = document.getElementById('unmergeIssueBtn');
        if (unmergeAction && unmergeBtn) {
            const isCitizenMerged = issue.isMerged;
            const isCollabMerged = issue.pendingMergeRequest && issue.pendingMergeRequest.status === 'accepted';
            
            let canUnmerge = false;
            if (isCitizenMerged) {
                canUnmerge = true;
            } else if (isCollabMerged) {
                const currentAuthId = currentUser.authorityDetails?._id;
                const fromAuthId = issue.pendingMergeRequest.from?._id || issue.pendingMergeRequest.from;
                const toAuthId = issue.pendingMergeRequest.to?._id || issue.pendingMergeRequest.to;
                
                if (currentAuthId === fromAuthId || currentAuthId === toAuthId || currentUser.role === 'admin') {
                    canUnmerge = true;
                }
            }
            
            unmergeAction.style.display = canUnmerge ? 'block' : 'none';
            if (isCollabMerged) {
                unmergeBtn.textContent = '🔓 End Collaboration';
            } else {
                unmergeBtn.textContent = '🔓 Unmerge this Issue';
            }
        }
    }

    // Delete button (for creator or admin)
    if (currentUser && (getCurrentUserId()?.toString() === issue.reportedBy?._id?.toString() || currentUser.role === 'admin')) {
        document.getElementById('deleteIssueBtn').style.display = 'block';
    }
    
    // Petition status
    if (issue.isPetition) {
        document.getElementById('petitionStatus').style.display = 'block';
    }
    
    // Complaint Generator - show if issue is unresolved and older than 30 days
    const daysSinceReported = Math.floor((new Date() - new Date(issue.createdAt)) / (1000 * 60 * 60 * 24));
    if (currentUser && issue.status !== 'resolved' && daysSinceReported >= 30) {
        document.getElementById('complaintGenerator').style.display = 'block';
    }
    
    // Complaint Filing Section (New)
    initComplaintSection(issue);

    // Citizen Updates Section
    const updates = issue.citizenUpdates || [];
    displayCitizenUpdates(updates);
    
    const citizenUpdatesSection = document.getElementById('citizenUpdatesSection');
    if (citizenUpdatesSection && (updates.length > 0 || isCreator)) {
        citizenUpdatesSection.style.display = 'block';
    }
    
    const addUpdateBtn = document.getElementById('addCitizenUpdateBtn');
    if (addUpdateBtn) {
        if (isCreator && issue.status !== 'resolved' && issue.status !== 'denied') {
            addUpdateBtn.style.display = 'block';
        } else {
            addUpdateBtn.style.display = 'none';
        }
    }
    
    // Rating section - show if issue is resolved and user is the reporter
    if (currentUser && issue.status === 'resolved' && getCurrentUserId()?.toString() === issue.reportedBy?._id?.toString() && issue.assignedAuthority) {
        // Prevent authorities from rating themselves
        const currentAuthorityId = currentUser.authorityDetails?._id;
        const assignedAuthorityId = issue.assignedAuthority?._id || issue.assignedAuthority;
        
        if (currentAuthorityId && currentAuthorityId.toString() === assignedAuthorityId.toString()) {
            console.log('Authority cannot rate themselves');
            const ratingSection = document.getElementById('ratingSection');
            if (ratingSection) ratingSection.style.display = 'none';
        } else {
            checkAndShowRating(issue._id);
        }
    }
    
    // Load share statistics
    loadShareStats(issue._id);
}

// Display comments
async function loadComments(issueId) {
    try {
        const response = await fetch(`${API_URL}/issues/${issueId}/comments`);
        if (!response.ok) throw new Error('Failed to load comments');
        
        const data = await response.json();
        displayComments(data.comments);
    } catch (error) {
        console.error('Error loading comments:', error);
    }
}

function displayCitizenUpdates(updates) {
    const list = document.getElementById('citizenUpdatesList');
    if (!list) return;

    if (!updates || updates.length === 0) {
        list.innerHTML = '<p class="no-issues">No updates from the reporter yet.</p>';
        return;
    }

    // Sort updates by date (newest first)
    const sortedUpdates = [...updates].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    list.innerHTML = sortedUpdates.map(update => {
        const imagesHtml = (update.images || []).map(img => `
            <div class="update-image" onclick="openMediaModalByUrl('${img.url}')">
                <img src="${img.url}" alt="Update image" loading="lazy">
            </div>
        `).join('');

        return `
            <div class="citizen-update-item" style="padding: 16px; background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px;">
                <div class="update-header" style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.8rem; color: var(--text-secondary);">
                    <span>Reporter Update</span>
                    <span>${getTimeAgo(update.createdAt)}</span>
                </div>
                <div class="update-content" style="font-size: 0.95rem; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(update.content)}</div>
                ${imagesHtml ? `<div class="update-gallery" style="display: flex; gap: 8px; margin-top: 12px; overflow-x: auto;">${imagesHtml}</div>` : ''}
            </div>
        `;
    }).join('');
}

// Helper for opening media modal with a direct URL (for citizen updates)
window.openMediaModalByUrl = function(url) {
    const modal = document.getElementById('mediaModal');
    const content = document.getElementById('mediaModalContent');
    const counter = document.getElementById('mediaModalCounter');
    
    if (!modal || !content) return;
    
    content.innerHTML = `<img src="${url}" alt="Full screen image">`;
    counter.textContent = ''; // Hide counter for single images
    
    modal.style.display = 'block';
    
    // Hide navigation arrows
    document.querySelectorAll('.media-modal-nav').forEach(nav => nav.style.display = 'none');
};

async function loadIssueUpdates(issueId) {
    try {
        const response = await fetch(`${API_URL}/issues/${issueId}/updates`);
        if (!response.ok) throw new Error('Failed to load updates');

        const data = await response.json();
        renderIssueTracker(data.tracker, data.updates || []);
    } catch (error) {
        console.error('Error loading issue updates:', error);
        renderIssueTracker(null, []);
    }
}

function getUpdateImages(update) {
    if (Array.isArray(update.images) && update.images.length > 0) {
        return update.images.map(img => img.url).filter(Boolean);
    }

    if (update.mediaUrl) {
        return [update.mediaUrl];
    }

    return [];
}

function renderIssueTracker(tracker, updates) {
    const trackerPercent = document.getElementById('trackerPercent');
    const trackerBar = document.getElementById('trackerBar');
    const trackerStages = document.getElementById('trackerStages');
    const currentStageTitle = document.getElementById('currentStageTitle');
    const currentStageSummary = document.getElementById('currentStageSummary');
    const stageUpdateImages = document.getElementById('stageUpdateImages');
    const timelineUpdates = document.getElementById('timelineUpdates');

    if (!trackerPercent || !trackerBar || !trackerStages || !currentStageTitle || !currentStageSummary || !stageUpdateImages || !timelineUpdates) {
        return;
    }

    const trackerData = tracker || {
        progressPercent: 0,
        currentStageKey: 'planning',
        stages: TRACKER_STAGE_SEQUENCE.map((stage, index) => ({
            ...stage,
            order: index + 1,
            completed: false
        }))
    };

    currentTracker = trackerData;
    const percent = Math.max(0, Math.min(100, Number(trackerData.progressPercent) || 0));
    trackerPercent.textContent = `${percent}%`;
    trackerBar.style.width = `${percent}%`;
    // Mirror compact top tracker percent if present
    const topPercentEl = document.getElementById('topTrackerPercent');
    if (topPercentEl) topPercentEl.textContent = `${percent}%`;
    // Mirror compact top tracker visual bar (uses CSS variable)
    const topToggleEl = document.getElementById('topTrackerToggle');
    if (topToggleEl) topToggleEl.style.setProperty('--top-bar-width', `${percent}%`);

    const currentStageKey = trackerData.currentStageKey || 'planning';
    trackerStages.innerHTML = (trackerData.stages || []).map(stage => {
        const classes = ['tracker-stage'];
        if (stage.completed) classes.push('completed');
        if (stage.key === currentStageKey) classes.push('active');
        return `<div class="${classes.join(' ')}">${escapeHtml(stage.label)}</div>`;
    }).join('');

    const latestUpdate = updates && updates.length > 0 ? updates[0] : null;
    const activeStage = (trackerData.stages || []).find(stage => stage.key === currentStageKey);

    currentStageTitle.textContent = latestUpdate?.stageTitle || activeStage?.label || 'No updates yet';
    currentStageSummary.textContent = latestUpdate?.content || 'No update yet for this stage.';

    const latestImages = latestUpdate ? getUpdateImages(latestUpdate) : [];
    stageUpdateImages.innerHTML = latestImages.map(url => `<li><img src="${url}" alt="Progress update image" loading="lazy"></li>`).join('');

    if (!updates || updates.length === 0) {
        timelineUpdates.innerHTML = '<div class="timeline-update-item">No authority updates yet.</div>';
        return;
    }

    timelineUpdates.innerHTML = updates.map(update => {
        const stageLabel = update.stageTitle || TRACKER_STAGE_SEQUENCE.find(stage => stage.key === update.stageKey)?.label || 'Authority update';
        const images = getUpdateImages(update);
        return `
            <article class="timeline-update-item">
                <div class="timeline-update-head">
                    <span class="timeline-update-stage">${escapeHtml(stageLabel)}</span>
                    <span class="timeline-update-time">${getTimeAgo(update.createdAt)}</span>
                </div>
                <p class="timeline-update-content">${escapeHtml(update.content || '')}</p>
                ${images.length > 0 ? `<div class="timeline-update-gallery">${images.map(url => `<img src="${url}" alt="Progress photo" loading="lazy">`).join('')}</div>` : ''}
            </article>
        `;
    }).join('');
}

function displayComments(comments) {
    const commentsList = document.getElementById('commentsList');
    
    if (!comments || comments.length === 0) {
        commentsList.innerHTML = '<p class="no-issues">No comments yet. Be the first to comment!</p>';
        return;
    }

    // Separate top-level comments and replies
    const topLevelComments = comments.filter(c => !c.parentCommentId);
    const repliesMap = {};
    
    comments.forEach(comment => {
        if (comment.parentCommentId) {
            if (!repliesMap[comment.parentCommentId]) {
                repliesMap[comment.parentCommentId] = [];
            }
            repliesMap[comment.parentCommentId].push(comment);
        }
    });

    // Render comments with threading
    commentsList.innerHTML = topLevelComments.map(comment => 
        renderComment(comment, repliesMap)
    ).join('');
    
    // Add event listeners for reply buttons
    document.querySelectorAll('.reply-btn').forEach(btn => {
        btn.addEventListener('click', handleReplyClick);
    });
}

function renderComment(comment, repliesMap, isReply = false) {
    const replies = repliesMap[comment._id] || [];
    const isOfficial = comment.authorId?.role === 'authority' || comment.authorId?.role === 'admin';
    const authorName = comment.authorId?.displayName || comment.authorId?.name || 'Anonymous';
    const authorUsername = comment.authorId?.username;
    
    return `
        <div class="comment ${isReply ? 'comment-reply' : ''} ${isOfficial ? 'comment-official' : ''}" data-comment-id="${comment._id}" id="comment-${comment._id}">
            <div class="comment-header">
                <span class="comment-author">
                    ${authorUsername ? `<a href="/profile/${authorUsername}">${authorName}</a>` : authorName}
                    ${isOfficial ? `<span class="badge">Official</span>` : ''}
                </span>
                <span class="comment-date">${getTimeAgo(comment.createdAt)}</span>
            </div>
            <div class="comment-body">${escapeHtml(comment.body)}</div>
            <div class="comment-actions">
                <button class="reply-btn" data-comment-id="${comment._id}" data-author-name="${authorName}">
                    <span>💬</span> Reply
                </button>
                <a href="/comment/${comment._id}" class="comment-link-btn" style="color: var(--text-secondary); text-decoration: none; font-size: 0.875rem; padding: 4px 8px;">
                    <span>🔗</span> Link
                </a>
            </div>
            ${replies.length > 0 ? `
                <div class="comment-replies">
                    ${replies.map(reply => renderComment(reply, repliesMap, true)).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Setup event listeners
function setupEventListeners() {
    // Upvote button
    document.getElementById('upvoteBtn')?.addEventListener('click', handleUpvote);

    // Add comment form
    document.getElementById('addCommentForm')?.addEventListener('submit', handleAddComment);

    // Update status (authority)
    document.getElementById('updateStatusBtn')?.addEventListener('click', handleUpdateStatus);
    
    // Accept issue (authority)
    document.getElementById('acceptBtn')?.addEventListener('click', handleAcceptIssue);
    
    // View petition button
    document.getElementById('viewPetitionBtn')?.addEventListener('click', handleViewPetition);
    
    // Generate Complaint button
    document.getElementById('generateComplaintBtn')?.addEventListener('click', handleGenerateComplaint);
    
    // Deny issue (authority)
    document.getElementById('denyBtn')?.addEventListener('click', handleDenyIssue);

    // Merge with Authority (authority)
    document.getElementById('mergeAuthorityBtn')?.addEventListener('click', handleOpenMergeModal);
    document.getElementById('unmergeIssueBtn')?.addEventListener('click', handleUnmergeIssue);
    document.getElementById('closeMergeModal')?.addEventListener('click', handleCloseMergeModal);
    document.getElementById('cancelMergeBtn')?.addEventListener('click', handleCloseMergeModal);
    document.getElementById('authoritySearch')?.addEventListener('input', debounce(handleAuthoritySearch, 300));
    document.getElementById('confirmMergeBtn')?.addEventListener('click', handleConfirmMergeRequest);

    // Delete issue
    document.getElementById('deleteIssueBtn')?.addEventListener('click', handleDeleteIssue);
    
    // Rating form
    document.getElementById('ratingForm')?.addEventListener('submit', handleSubmitRating);

    // Complaint buttons
    document.getElementById('markDissatisfiedBtn')?.addEventListener('click', handleMarkDissatisfied);
    document.getElementById('submitComplaintBtn')?.addEventListener('click', handleSubmitComplaint);

    // Draft remarks (authority)
    document.getElementById('saveDraftRemarksBtn')?.addEventListener('click', handleSaveDraftRemarks);
    document.getElementById('publishSuccessBtn')?.addEventListener('click', handlePublishSuccessStory);

    // Authority progress updates
    document.getElementById('progressUpdateForm')?.addEventListener('submit', handlePostProgressUpdate);
    document.getElementById('progressStage')?.addEventListener('change', handleProgressStageChange);

    // Share buttons
    const mainShareBtn = document.getElementById('mainShareBtn');
    if (mainShareBtn) {
        mainShareBtn.addEventListener('click', openShareModal);
    }

    const closeShareModal = document.getElementById('closeShareModal');
    if (closeShareModal) {
        closeShareModal.addEventListener('click', () => {
            document.getElementById('shareModal').style.display = 'none';
        });
    }

    const copyLinkBtn = document.getElementById('copyLinkBtn');
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', copyShareLink);
    }

    const socialItems = document.querySelectorAll('.social-item');
    socialItems.forEach(item => {
        item.addEventListener('click', () => handleShare(item.dataset.platform));
    });

    // Card download button
    document.getElementById('downloadCardBtn')?.addEventListener('click', () => generateIssueCard(true));

    // Citizen Update Handlers
    handleCitizenUpdateListeners();

    const stageSelect = document.getElementById('progressStage');
    if (stageSelect) {
        handleProgressStageChange({ target: stageSelect });
    }

    // Top tracker toggle
    const topToggle = document.getElementById('topTrackerToggle');
    if (topToggle) {
        topToggle.addEventListener('click', (e) => {
            e.preventDefault();
            const top = document.getElementById('topExecutionTracker');
            const panel = document.getElementById('topTrackerPanel');
            if (!top || !panel) return;
            const expanded = top.classList.toggle('expanded');
            top.classList.toggle('collapsed', !expanded);
            panel.setAttribute('aria-hidden', String(!expanded));
            topToggle.setAttribute('aria-expanded', String(expanded));
        });
    }
}

function handleProgressStageChange(e) {
    const stage = e.target.value;
    const percentInput = document.getElementById('progressPercent');
    if (!percentInput) return;

    const stageIndex = TRACKER_STAGE_SEQUENCE.findIndex(item => item.key === stage);
    if (stageIndex === -1) return;

    const defaultPercent = Math.round(((stageIndex + 1) / TRACKER_STAGE_SEQUENCE.length) * 100);
    percentInput.value = defaultPercent;
}

// Handle citizen updates
function handleCitizenUpdateListeners() {
    const addBtn = document.getElementById('addCitizenUpdateBtn');
    const cancelBtn = document.getElementById('cancelCitizenUpdateBtn');
    const formContainer = document.getElementById('citizenUpdateFormContainer');
    const form = document.getElementById('citizenUpdateForm');

    if (addBtn && formContainer) {
        addBtn.addEventListener('click', () => {
            formContainer.style.display = 'block';
            addBtn.style.display = 'none';
        });
    }

    if (cancelBtn && formContainer && addBtn) {
        cancelBtn.addEventListener('click', () => {
            formContainer.style.display = 'none';
            addBtn.style.display = 'block';
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const content = document.getElementById('citizenUpdateContent').value.trim();
            const imageFiles = document.getElementById('citizenUpdateImages').files;
            const submitBtn = document.getElementById('submitCitizenUpdateBtn');

            if (!content) return;

            submitBtn.disabled = true;
            submitBtn.textContent = 'Posting...';

            try {
                const formData = new FormData();
                formData.append('content', content);
                for (let i = 0; i < imageFiles.length; i++) {
                    formData.append('images', imageFiles[i]);
                }

                const response = await fetch(`${API_URL}/issues/${currentIssue._id}/citizen-update`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${getToken()}`
                    },
                    body: formData
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to post update');

                alert('Update posted successfully!');
                location.reload();
            } catch (error) {
                console.error('Error posting citizen update:', error);
                alert(error.message);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Post Update';
            }
        });
    }
}

// Handle upvote
async function handleUpvote() {
    if (!currentUser) {
        alert('Please login to upvote');
        window.location.href = '/login';
        return;
    }
    
    // Check if user is verified
    if (!currentUser.isAadhaarVerified && !currentUser.isVerified) {
        if (typeof showVerificationRequiredModal === 'function') {
            showVerificationRequiredModal();
        } else {
            alert('You must verify your identity to upvote. Please visit the verification page.');
            window.location.href = '/verify';
        }
        return;
    }

    // Prevent duplicate requests
    if (upvoteInFlight) return;

    const upvoteBtn = document.getElementById('upvoteBtn');
    upvoteInFlight = true;
    upvoteBtn.disabled = true;
    upvoteBtn.classList.add('loading');

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/upvote`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();

        if (!response.ok) {
            // Show specific error message
            alert(data.error || 'Failed to upvote');
            return;
        }

        // Update UI
        document.getElementById('upvoteCount').textContent = data.upvoteCount;
        
        if (data.hasUpvoted) {
            upvoteBtn?.classList.add('upvoted');
        } else {
            upvoteBtn?.classList.remove('upvoted');
        }

        // Show petition notification if created
        if (data.petitionCreated) {
            alert('🎉 Congratulations! This issue has reached 10,000 upvotes and has been converted to a PETITION!');
            // Reload to show petition status
            setTimeout(() => window.location.reload(), 1500);
        }
    } catch (error) {
        console.error('Upvote error:', error);
        alert('Failed to upvote');
    } finally {
        upvoteInFlight = false;
        const upvoteBtn = document.getElementById('upvoteBtn');
        if (upvoteBtn) {
            upvoteBtn.disabled = false;
            upvoteBtn.classList.remove('loading');
        }
    }
}

// Handle add comment
async function handleAddComment(e) {
    e.preventDefault();

    if (!currentUser) {
        alert('Please login to comment');
        window.location.href = '/login';
        return;
    }
    
    // Check if user is verified
    if (!currentUser.isAadhaarVerified && !currentUser.isVerified) {
        if (typeof showVerificationRequiredModal === 'function') {
            showVerificationRequiredModal();
        } else {
            alert('You must verify your identity to comment. Please visit the verification page.');
            window.location.href = '/verify';
        }
        return;
    }

    const input = document.getElementById('commentInput');
    const body = input.value.trim();
    const parentCommentId = input.dataset.parentCommentId || null;

    if (!body) return;

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                body,
                parentCommentId
            })
        });

        if (!response.ok) throw new Error('Failed to add comment');

        // Clear form
        input.value = '';
        delete input.dataset.parentCommentId;
        document.getElementById('replyingTo')?.remove();
        
        // Reload comments
        await loadComments(currentIssue._id);
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Failed to add comment');
    }
}

// Handle reply button click
function handleReplyClick(e) {
    const btn = e.currentTarget;
    const commentId = btn.dataset.commentId;
    const authorName = btn.dataset.authorName;
    
    const input = document.getElementById('commentInput');
    input.dataset.parentCommentId = commentId;
    input.placeholder = `Replying to ${authorName}...`;
    input.focus();
    
    // Show reply indicator
    let indicator = document.getElementById('replyingTo');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'replyingTo';
        indicator.className = 'replying-indicator';
        input.parentElement.insertBefore(indicator, input);
    }
    indicator.innerHTML = `
        Replying to <strong>${authorName}</strong>
        <button type="button" class="cancel-reply" onclick="cancelReply()">✕</button>
    `;
}

// Cancel reply
function cancelReply() {
    const input = document.getElementById('commentInput');
    delete input.dataset.parentCommentId;
    input.placeholder = 'Add a comment...';
    document.getElementById('replyingTo')?.remove();
}

// Expose cancelReply to global scope for inline onclick
window.cancelReply = cancelReply;

// Handle update status (authority)
async function handleUpdateStatus() {
    const status = document.getElementById('statusSelect').value;

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ status })
        });

        if (!response.ok) throw new Error('Failed to update status');

        alert('Status updated successfully');
        window.location.reload();
    } catch (error) {
        console.error('Update status error:', error);
        alert('Failed to update status');
    }
}

// Handle accept issue (authority)
// Debounce helper
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Modal Handlers
function handleOpenMergeModal() {
    document.getElementById('mergeModal').style.display = 'block';
    document.getElementById('authoritySearch').focus();
}

function handleCloseMergeModal() {
    document.getElementById('mergeModal').style.display = 'none';
    // Clear search and selection
    document.getElementById('authoritySearch').value = '';
    document.getElementById('authoritySearchResults').innerHTML = '<p style="padding: 12px; text-align: center; color: var(--text-secondary);">Start typing to search...</p>';
    document.getElementById('selectedAuthorityContainer').style.display = 'none';
    document.getElementById('confirmMergeBtn').disabled = true;
}

async function handleAuthoritySearch(e) {
    const query = e.target.value.trim();
    const resultsContainer = document.getElementById('authoritySearchResults');
    
    if (query.length < 2) {
        resultsContainer.innerHTML = '<p style="padding: 12px; text-align: center; color: var(--text-secondary);">Start typing to search...</p>';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/authority?search=${encodeURIComponent(query)}&limit=10`);
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Failed to search authorities');

        const authorities = data.authorities.filter(auth => {
            // Don't show the currently assigned authority
            const assignedId = currentIssue.assignedAuthority?._id || currentIssue.assignedAuthority;
            return auth._id !== assignedId;
        });

        if (authorities.length === 0) {
            resultsContainer.innerHTML = '<p style="padding: 12px; text-align: center;">No authorities found.</p>';
            return;
        }

        resultsContainer.innerHTML = authorities.map(auth => `
            <div class="search-result-item" onclick="selectAuthorityForMerge('${auth._id}', '${auth.userId?.displayName || auth.designation || 'Authority'}')">
                <div style="font-weight: 600;">${auth.userId?.displayName || 'Authority'}</div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">
                    ${auth.designation || ''} ${auth.department ? `- ${auth.department}` : ''}
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">
                    ${auth.jurisdictionDistrict || ''}, ${auth.jurisdictionState || ''}
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = '<p style="padding: 12px; text-align: center; color: var(--error-color);">Failed to search authorities.</p>';
    }
}

// Global function to be called from onclick in search results
window.selectAuthorityForMerge = function(id, name) {
    document.getElementById('selectedAuthorityId').value = id;
    document.getElementById('selectedAuthorityName').textContent = name;
    document.getElementById('selectedAuthorityContainer').style.display = 'block';
    document.getElementById('confirmMergeBtn').disabled = false;
};

async function handleConfirmMergeRequest() {
    const targetAuthorityId = document.getElementById('selectedAuthorityId').value;
    const confirmBtn = document.getElementById('confirmMergeBtn');
    
    if (!targetAuthorityId) return;

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Sending...';

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/merge-request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ targetAuthorityId })
        });

        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error || 'Failed to send merge request');

        alert('Merge request sent successfully!');
        handleCloseMergeModal();
    } catch (error) {
        console.error('Merge request error:', error);
        alert(error.message);
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Send Merge Request';
    }
}

async function handleUnmergeIssue() {
    if (!confirm('Are you sure you want to unmerge this issue? It will be moved back to the pending state.')) {
        return;
    }

    const unmergeBtn = document.getElementById('unmergeIssueBtn');
    unmergeBtn.disabled = true;
    unmergeBtn.textContent = 'Unmerging...';

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/unmerge`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            location.reload();
        } else {
            alert(data.error || 'Failed to unmerge issue.');
        }
    } catch (error) {
        console.error('Error unmerging issue:', error);
        alert('Error unmerging issue. Please try again.');
    } finally {
        unmergeBtn.disabled = false;
        const isCollabMerged = currentIssue.pendingMergeRequest && currentIssue.pendingMergeRequest.status === 'accepted';
        unmergeBtn.textContent = isCollabMerged ? '🔓 End Collaboration' : '🔓 Unmerge this Issue';
    }
}

// Existing handlers...
async function handleAcceptIssue() {
    if (!confirm('Are you sure you want to accept this issue?')) {
        return;
    }

    const deadlineInput = prompt('Enter expected completion date (YYYY-MM-DD):');
    if (!deadlineInput) {
        alert('Deadline is required to accept this issue.');
        return;
    }

    const deadlineDate = new Date(`${deadlineInput}T23:59:59`);
    if (Number.isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
        alert('Please provide a valid future date in YYYY-MM-DD format.');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ deadline: deadlineDate.toISOString() })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to accept issue');
        }

        alert('Issue accepted successfully');
        window.location.reload();
    } catch (error) {
        console.error('Accept issue error:', error);
        alert(error.message || 'Failed to accept issue');
    }
}

// Handle deny issue (authority)
async function handleDenyIssue() {
    const reason = prompt('Please provide a reason for denying this issue:');
    
    if (!reason) {
        alert('A reason is required to deny an issue.');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/deny`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ reason })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to deny issue');
        }

        alert('Issue denied successfully');
        window.location.reload();
    } catch (error) {
        console.error('Deny issue error:', error);
        alert(error.message || 'Failed to deny issue');
    }
}

async function handleSaveDraftRemarks() {
    const draftRemarksText = document.getElementById('draftRemarksText');
    const saveBtn = document.getElementById('saveDraftRemarksBtn');
    const statusSpan = document.getElementById('draftSaveStatus');

    if (!draftRemarksText || !saveBtn || !currentIssue) return;

    const draftRemarks = draftRemarksText.value.trim();

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/draft-remarks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ draftRemarks })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to save draft');

        if (statusSpan) {
            statusSpan.style.display = 'inline';
            setTimeout(() => {
                statusSpan.style.display = 'none';
            }, 3000);
        }
    } catch (error) {
        console.error('Save draft remarks error:', error);
        alert(error.message || 'Failed to save draft remarks');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Draft';
    }
}

async function handlePublishSuccessStory() {
    if (!confirm('Are you sure you want to publish this success story? It will be visible to everyone on the home page.')) {
        return;
    }

    const publishBtn = document.getElementById('publishSuccessBtn');
    if (!publishBtn || !currentIssue) return;

    publishBtn.disabled = true;
    publishBtn.textContent = 'Publishing...';

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/publish-remarks`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to publish success story');

        alert('Success story published successfully!');
        window.location.reload();
    } catch (error) {
        console.error('Publish success story error:', error);
        alert(error.message || 'Failed to publish success story');
    } finally {
        publishBtn.disabled = false;
        publishBtn.textContent = 'Publish Success Story';
    }
}

async function handlePostProgressUpdate(e) {
    e.preventDefault();

    if (!currentIssue || !currentUser) {
        alert('Please login as authority to post updates');
        return;
    }

    const contentEl = document.getElementById('progressUpdateText');
    const stageEl = document.getElementById('progressStage');
    const percentEl = document.getElementById('progressPercent');
    const imagesEl = document.getElementById('progressImages');
    const submitBtn = document.getElementById('postProgressBtn');

    const content = contentEl?.value?.trim();
    const stageKey = stageEl?.value;
    const progressPercent = parseInt(percentEl?.value, 10);

    if (!content) {
        alert('Please add update details');
        return;
    }

    if (Number.isNaN(progressPercent) || progressPercent < 0 || progressPercent > 100) {
        alert('Progress percent must be between 0 and 100');
        return;
    }

    const formData = new FormData();
    formData.append('content', content);
    formData.append('stageKey', stageKey);
    formData.append('progressPercent', progressPercent.toString());
    formData.append('stageTitle', TRACKER_STAGE_SEQUENCE.find(stage => stage.key === stageKey)?.label || 'Progress update');

    const imageFiles = Array.from(imagesEl?.files || []).slice(0, 5);
    imageFiles.forEach(file => formData.append('images', file));

    submitBtn.disabled = true;
    submitBtn.textContent = 'Posting update...';

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/update`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            },
            body: formData
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to post update');
        }

        contentEl.value = '';
        imagesEl.value = '';
        alert('Progress update posted successfully');

        await loadIssueUpdates(currentIssue._id);
        if (data.tracker?.progressPercent >= 100) {
            await loadIssue(currentIssue._id);
        }
    } catch (error) {
        console.error('Post progress update error:', error);
        alert(error.message || 'Failed to post progress update');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Post Update';
    }
}

// Handle delete issue
async function handleDeleteIssue() {
    if (!confirm('Are you sure you want to delete this issue?')) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) throw new Error('Failed to delete issue');

        alert('Issue deleted successfully');
        window.location.href = '/district';
    } catch (error) {
        console.error('Delete issue error:', error);
        alert('Failed to delete issue');
    }
}

// Utility function to format dates
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString();
}

// Get time ago string
function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now - date;
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    if (diffWeeks < 4) return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;
    if (diffMonths < 12) return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
    
    return date.toLocaleDateString();
}

// Check if rating exists, show form or display rating
async function checkAndShowRating(issueId) {
    try {
        const response = await fetch(`${API_URL}/ratings/issue/${issueId}`);
        
        if (response.ok) {
            const data = await response.json();
            displayExistingRating(data.rating);
        } else {
            // No rating found, show rating form
            document.getElementById('ratingSection').style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking rating:', error);
        // Show form on error
        document.getElementById('ratingSection').style.display = 'block';
    }
}

// Display existing rating
function displayExistingRating(rating) {
    document.getElementById('existingRating').style.display = 'block';
    
    // Display star ratings
    document.getElementById('displaySpeed').innerHTML = getStarDisplay(rating.speedScore);
    document.getElementById('displayEfficiency').innerHTML = getStarDisplay(rating.efficiencyScore);
    document.getElementById('displaySatisfaction').innerHTML = getStarDisplay(rating.satisfactionScore);
    
    // Display comment if exists
    if (rating.comment) {
        document.getElementById('displayComment').innerHTML = `<p><strong>Comment:</strong> ${escapeHtml(rating.comment)}</p>`;
    }
}

// Generate star display HTML
function getStarDisplay(score) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        stars += i <= score ? '★' : '☆';
    }
    return `${stars} (${score}/5)`;
}

// Handle rating form submission
async function handleSubmitRating(e) {
    e.preventDefault();
    
    const speedScore = parseInt(document.querySelector('input[name="speedScore"]:checked')?.value);
    const efficiencyScore = parseInt(document.querySelector('input[name="efficiencyScore"]:checked')?.value);
    const satisfactionScore = parseInt(document.querySelector('input[name="satisfactionScore"]:checked')?.value);
    const comment = document.getElementById('ratingComment').value.trim();
    
    if (!speedScore || !efficiencyScore || !satisfactionScore) {
        alert('Please provide all ratings');
        return;
    }
    
    const errorDiv = document.getElementById('ratingError');
    errorDiv.textContent = '';
    errorDiv.classList.remove('show');
    
    try {
        const response = await fetch(`${API_URL}/ratings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                issueId: currentIssue._id,
                speedScore,
                efficiencyScore,
                satisfactionScore,
                comment
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to submit rating');
        }
        
        // Hide form and show success message
        document.getElementById('ratingSection').style.display = 'none';
        alert('Thank you for rating the authority!');
        
        // Display the submitted rating
        displayExistingRating(data.rating);
    } catch (error) {
        console.error('Error submitting rating:', error);
        errorDiv.textContent = error.message;
        errorDiv.classList.add('show');
    }
}

// Handle view petition
async function handleViewPetition(e) {
    e.preventDefault();
    
    if (!currentIssue) return;
    
    try {
        const response = await fetch(`${API_URL}/petitions/issue/${currentIssue._id}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to load petition');
        }
        
        const data = await response.json();
        const petition = data.petition;
        
        // Fetch petition document
        const docResponse = await fetch(`${API_URL}/petitions/${petition._id}/document`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!docResponse.ok) {
            throw new Error('Failed to load petition document');
        }
        
        const docData = await docResponse.json();
        
        // Display petition in a modal or new window
        const petitionWindow = window.open('', '_blank');
        petitionWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Petition - ${currentIssue.title}</title>
                <style>
                    body {
                        font-family: 'Times New Roman', serif;
                        max-width: 800px;
                        margin: 40px auto;
                        padding: 20px;
                        line-height: 1.6;
                    }
                    h1 { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
                    .metadata { background: #f5f5f5; padding: 15px; margin: 20px 0; }
                    .document { white-space: pre-wrap; }
                    .actions { margin-top: 30px; text-align: center; }
                    button { padding: 10px 20px; margin: 0 10px; font-size: 16px; cursor: pointer; }
                </style>
            </head>
            <body>
                <h1>PETITION DOCUMENT</h1>
                <div class="metadata">
                    <strong>Issue:</strong> ${docData.metadata.issueTitle}<br>
                    <strong>Location:</strong> ${docData.metadata.district}, ${docData.metadata.state}<br>
                    <strong>Upvotes:</strong> ${docData.metadata.upvoteCount.toLocaleString('en-IN')}<br>
                    <strong>Date Reported:</strong> ${new Date(docData.metadata.dateReported).toLocaleDateString('en-IN')}<br>
                    <strong>Petition ID:</strong> ${petition._id}
                </div>
                <div class="document">${docData.petitionDocument}</div>
                <div class="actions">
                    <button onclick="window.print()">🖨️ Print</button>
                    <button onclick="window.close()">Close</button>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error viewing petition:', error);
        alert('Failed to load petition: ' + error.message);
    }
}

// Handle generate Complaint
async function handleGenerateComplaint() {
    if (!currentIssue || !currentUser) return;
    
    const btn = document.getElementById('generateComplaintBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Generating...';
    
    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/generate-complaint`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to generate Complaint');
        }
        
        const data = await response.json();
        
        // Display Complaint in a new window
        const complaintWindow = window.open('', '_blank');
        complaintWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Complaint Application - ${currentIssue.title}</title>
                <style>
                    body {
                        font-family: 'Times New Roman', serif;
                        max-width: 800px;
                        margin: 40px auto;
                        padding: 20px;
                        line-height: 1.8;
                    }
                    h1 { text-align: center; border-bottom: 3px solid #000; padding-bottom: 15px; }
                    .metadata { 
                        background: #fffacd; 
                        padding: 15px; 
                        margin: 20px 0; 
                        border-left: 4px solid #ffa500;
                    }
                    .document { white-space: pre-wrap; text-align: justify; }
                    .actions { 
                        margin-top: 30px; 
                        text-align: center; 
                        padding: 20px;
                        background: #f0f0f0;
                        border-radius: 8px;
                    }
                    button { 
                        padding: 12px 24px; 
                        margin: 0 10px; 
                        font-size: 16px; 
                        cursor: pointer;
                        border: none;
                        border-radius: 4px;
                        font-weight: bold;
                    }
                    .print-btn { background: #4CAF50; color: white; }
                    .close-btn { background: #999; color: white; }
                    .note { color: #d00; font-weight: bold; margin-top: 20px; padding: 10px; background: #fee; }
                </style>
            </head>
            <body>
                <h1>OFFICIAL COMPLAINT APPLICATION</h1>
                <div class="metadata">
                    <strong>📋 Issue:</strong> ${data.metadata.issueTitle}<br>
                    <strong>📍 Location:</strong> ${data.metadata.district}, ${data.metadata.state}<br>
                    <strong>📅 Reported On:</strong> ${new Date(data.metadata.dateReported).toLocaleDateString('en-IN')}<br>
                    <strong>⏰ Days Pending:</strong> ${data.metadata.daysSinceReported} days<br>
                    <strong>🏛️ Department:</strong> ${data.metadata.authorityDepartment}<br>
                    <strong>🔖 Reference:</strong> ${data.metadata.issueId}
                </div>
                <div class="document">${data.complaintDocument}</div>
                <div class="note">
                    ⚠️ IMPORTANT: Please review and customize this draft before submission. 
                    Add your postal address and contact details as required by your local administrative office.
                </div>
                <div class="actions">
                    <button class="print-btn" onclick="window.print()">🖨️ Print Complaint Application</button>
                    <button class="close-btn" onclick="window.close()">Close</button>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error generating Complaint:', error);
        alert('Failed to generate Complaint: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '📄 Generate Complaint Application';
    }
}

// Share modal functions
function openShareModal() {
    if (!currentIssue) return;
    
    const modal = document.getElementById('shareModal');
    const title = document.getElementById('previewTitle');
    const location = document.getElementById('previewLocation');
    const category = document.getElementById('previewCategory');
    const categoryIcon = document.getElementById('previewCategoryIcon');
    const upvotes = document.getElementById('previewUpvotes');
    const description = document.getElementById('previewDescription');
    const linkInput = document.getElementById('shareLinkInput');
    
    title.textContent = currentIssue.title;
    location.textContent = `${currentIssue.district}, ${currentIssue.state}`;
    category.textContent = currentIssue.category.toUpperCase();
    categoryIcon.textContent = getCategoryIcon(currentIssue.category);
    upvotes.textContent = currentIssue.upvoteCount || 0;
    description.textContent = currentIssue.description;
    linkInput.value = window.location.href;
    
    modal.style.display = 'flex';
}

function copyShareLink() {
    const linkInput = document.getElementById('shareLinkInput');
    const copyBtn = document.getElementById('copyLinkBtn');
    
    linkInput.select();
    linkInput.setSelectionRange(0, 99999); // For mobile devices
    
    navigator.clipboard.writeText(linkInput.value).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = '#28a745';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.background = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// Handle social share
async function handleShare(platform) {
    if (!currentIssue) return;

    const issueUrl = window.location.href;
    const shareText = `${currentIssue.title} - ${currentIssue.district}, ${currentIssue.category}`;
    
    let shareUrl = '';
    
    switch (platform) {
        case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(issueUrl)}`;
            break;
        case 'whatsapp':
            shareUrl = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + issueUrl)}`;
            break;
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(issueUrl)}`;
            break;
        case 'linkedin':
            shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(issueUrl)}`;
            break;
        case 'instagram':
            // Instagram doesn't have a direct share URL, so we generate a card for them to share
            alert('Instagram requires you to upload an image. We will generate an Issue Card for you to download and share!');
            await generateIssueCard(true);
            return;
        default:
            return;
    }

    // Open share window
    window.open(shareUrl, '_blank', 'width=600,height=400');

    // Track share if user is logged in
    if (currentUser) {
        try {
            await fetch(`${API_URL}/issues/${currentIssue._id}/share`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({ platform })
            });
            
            // Reload share stats
            await loadShareStats(currentIssue._id);
        } catch (error) {
            console.error('Error tracking share:', error);
        }
    }
}

// Load share statistics
async function loadShareStats(issueId) {
    try {
        const response = await fetch(`${API_URL}/issues/${issueId}/share-stats`);
        
        if (response.ok) {
            const stats = await response.json();
            const totalShares = stats.total;
            document.getElementById('totalShares').textContent = 
                `${totalShares} ${totalShares === 1 ? 'share' : 'shares'}`;
        }
    } catch (error) {
        console.error('Error loading share stats:', error);
    }
}

// Get category icon
function getCategoryIcon(category) {
    const icons = {
        roads: '🛣️',
        garbage: '🗑️',
        electricity: '⚡',
        water: '💧',
        streetlight: '💡',
        drainage: '🌊',
        other: '📋'
    };
    return icons[category?.toLowerCase()] || '📋';
}

// Generate a visual UI card for the issue using html2canvas
async function generateIssueCard(download = false) {
    if (!currentIssue) return null;

    const downloadBtn = document.getElementById('downloadCardBtn');
    const originalText = downloadBtn ? downloadBtn.innerHTML : '';
    
    if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '⏳ Generating Card...';
    }

    try {
        const cardOuter = document.getElementById('shareCardOuter');
        const title = document.getElementById('cardTitle');
        const desc = document.getElementById('cardDescription');
        const category = document.getElementById('cardCategory');
        const categoryIcon = document.getElementById('cardCategoryIcon');
        const location = document.getElementById('cardLocation');
        const upvotes = document.getElementById('cardUpvotes');
        const fullUrl = document.getElementById('cardFullUrl');
        const qrContainer = document.getElementById('cardQrContainer');

        if (!cardOuter) throw new Error('Share card template not found');

        // Fill card with current issue data
        title.textContent = currentIssue.title;
        desc.textContent = currentIssue.description;
        category.textContent = currentIssue.category.toUpperCase();
        categoryIcon.textContent = getCategoryIcon(currentIssue.category);
        location.textContent = currentIssue.district;
        upvotes.textContent = currentIssue.upvoteCount;
        fullUrl.textContent = window.location.href;

        // QR Code for the issue URL
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(window.location.href)}`;
        if (qrContainer) {
            qrContainer.innerHTML = `<img src="${qrUrl}" alt="QR Code" crossorigin="anonymous">`;
        }

        // Wait for images to load (QR code) with timeout
        const qrImage = qrContainer?.querySelector('img');
        if (qrImage) {
            await Promise.race([
                new Promise((resolve) => {
                    if (qrImage.complete) resolve();
                    else {
                        qrImage.onload = resolve;
                        qrImage.onerror = resolve; 
                    }
                }),
                new Promise(resolve => setTimeout(resolve, 3000)) 
            ]);
        }

        // Small delay for layout to settle
        await new Promise(resolve => setTimeout(resolve, 200));

        // Generate canvas from the card element
        if (typeof html2canvas === 'undefined') {
            throw new Error('html2canvas library not loaded');
        }

        const canvas = await html2canvas(cardOuter, {
            useCORS: true,
            allowTaint: false,
            scale: 1, // Already set to 1080x1920
            backgroundColor: null,
            logging: false,
            width: 1080,
            height: 1920
        });

        if (download) {
            const dataUrl = canvas.toDataURL('image/png');
            
            // Try Web Share API for mobile
            if (navigator.share && navigator.canShare && !window.matchMedia('(min-width: 1024px)').matches) {
                try {
                    const blob = await (await fetch(dataUrl)).blob();
                    const file = new File([blob], `JanAwaaz-Story.png`, { type: 'image/png' });
                    
                    if (navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: currentIssue.title,
                            text: `Help resolve this civic issue: ${currentIssue.title}`
                        });
                        return canvas;
                    }
                } catch (shareError) {
                    console.warn('Web Share API failed:', shareError);
                }
            }

            // Fallback to traditional download
            const link = document.createElement('a');
            link.download = `JanAwaaz-Story-${currentIssue._id}.png`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        return canvas;
    } catch (error) {
        console.error('Error generating issue card:', error);
        alert('Failed to generate sharing card: ' + error.message);
        return null;
    } finally {
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = originalText;
        }
    }
}

// Media Gallery Modal Functions
let currentMediaIndex = 0;
window.currentIssueImages = [];

function openMediaModal(index) {
    currentMediaIndex = index;
    const modal = document.getElementById('mediaModal');
    const modalContent = document.getElementById('mediaModalContent');
    const counter = document.getElementById('mediaModalCounter');
    
    if (!window.currentIssueImages || window.currentIssueImages.length === 0) {
        return;
    }
    
    const media = window.currentIssueImages[currentMediaIndex];
    
    // Determine if it's a video or image
    const isVideo = media.url && (
        media.url.includes('.mp4') || 
        media.url.includes('.webm') || 
        media.url.includes('.ogg') ||
        media.url.includes('video')
    );
    
    if (isVideo) {
        modalContent.innerHTML = `
            <video controls autoplay>
                <source src="${media.url}" type="video/mp4">
                Your browser does not support the video tag.
            </video>
        `;
    } else {
        modalContent.innerHTML = `<img src="${media.url}" alt="Issue media">`;
    }
    
    counter.textContent = `${currentMediaIndex + 1} / ${window.currentIssueImages.length}`;
    modal.classList.add('active');
    
    // Hide navigation arrows if only one image
    const prevBtn = document.querySelector('.media-modal-prev');
    const nextBtn = document.querySelector('.media-modal-next');
    if (window.currentIssueImages.length <= 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
    } else {
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
    }
    
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
}

function closeMediaModal() {
    const modal = document.getElementById('mediaModal');
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
}

function changeMedia(direction) {
    if (!window.currentIssueImages || window.currentIssueImages.length === 0) {
        return;
    }
    
    currentMediaIndex += direction;
    
    // Loop around
    if (currentMediaIndex < 0) {
        currentMediaIndex = window.currentIssueImages.length - 1;
    } else if (currentMediaIndex >= window.currentIssueImages.length) {
        currentMediaIndex = 0;
    }
    
    const modalContent = document.getElementById('mediaModalContent');
    const counter = document.getElementById('mediaModalCounter');
    const media = window.currentIssueImages[currentMediaIndex];
    
    const isVideo = media.url && (
        media.url.includes('.mp4') || 
        media.url.includes('.webm') || 
        media.url.includes('.ogg') ||
        media.url.includes('video')
    );
    
    if (isVideo) {
        modalContent.innerHTML = `
            <video controls autoplay>
                <source src="${media.url}" type="video/mp4">
                Your browser does not support the video tag.
            </video>
        `;
    } else {
        modalContent.innerHTML = `<img src="${media.url}" alt="Issue media">`;
    }
    
    counter.textContent = `${currentMediaIndex + 1} / ${window.currentIssueImages.length}`;
}

// Close modal on escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeMediaModal();
    } else if (e.key === 'ArrowLeft') {
        changeMedia(-1);
    } else if (e.key === 'ArrowRight') {
        changeMedia(1);
    }
});

// Close modal when clicking outside the image
document.getElementById('mediaModal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        closeMediaModal();
    }
});

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIssuePage);
} else {
    initIssuePage();
}

// Initialize real-time updates
    if (typeof realtimeManager !== 'undefined') {
        realtimeManager.joinIssue(issueId);

        realtimeManager.onIssueUpvoted((data) => {
            if (data.issueId === issueId) {
                document.getElementById('upvoteCount').textContent = data.upvotes;
                const upvoteBtn = document.getElementById('upvoteBtn');
                if (upvoteBtn) {
                    if (data.hasUpvoted) {
                        upvoteBtn.classList.add('upvoted');
                    } else {
                        upvoteBtn.classList.remove('upvoted');
                    }
                }
            }
        });

        realtimeManager.onCommentAdded((data) => {
            if (data.issueId === issueId) {
                loadComments(issueId);
            }
        });
    }

// Function to add comment to UI (called by realtime manager)
function addCommentToUI(comment) {
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return;
    
    // Create comment element
    const commentDiv = document.createElement('div');
    commentDiv.className = 'comment';
    commentDiv.innerHTML = `
        <img src="${comment.authorId.avatar || '/images/default-avatar.png'}" alt="${comment.authorId.name}">
        <div class="comment-content">
            <div class="comment-header">
                <strong>${comment.authorId.name}</strong>
                <span class="comment-time">Just now</span>
            </div>
            <p>${comment.body}</p>
        </div>
    `;
    
    commentsList.appendChild(commentDiv);
}

// Function to add update to timeline (called by realtime manager)
function addUpdateToTimeline(update) {
    if (!currentIssue?._id) return;
    loadIssueUpdates(currentIssue._id);
}

// Complaint Filing Logic
async function initComplaintSection(issue) {
    const complaintSection = document.getElementById('complaintFilingSection');
    const complaintInfo = document.getElementById('complaintFilingInfo');
    const dissatisfiedAction = document.getElementById('dissatisfiedAction');
    const complaintForm = document.getElementById('complaintForm');
    const complaintStatus = document.getElementById('complaintStatus');
    
    if (!complaintSection) return;

    // Check if user is reporter
    const isReporter = currentUser && getCurrentUserId()?.toString() === issue.reportedBy?._id?.toString();
    if (!isReporter) {
        complaintSection.style.display = 'none';
        return;
    }

    // Check if Complaint already filed
    try {
        const response = await fetch(`${API_URL}/issues/${issue._id}/complaint`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await response.json();
        
        if (data.complaint) {
            complaintSection.style.display = 'block';
            complaintStatus.style.display = 'block';
            document.getElementById('complaintRefNum').textContent = `Reference: ${data.complaint.complaintReferenceNumber}`;
            complaintInfo.textContent = 'A Complaint has already been filed for this issue.';
            return;
        }
    } catch (err) {
        console.error('Error checking Complaint status:', err);
    }

    const now = new Date();
    const createdAt = new Date(issue.createdAt);
    const seventyTwoHours = 72 * 60 * 60 * 1000;
    const isPast72h = (now - createdAt) > seventyTwoHours;

    let canFile = false;
    let complaintReason = '';

    // Condition A: Declined and unsatisfied
    if (issue.status === 'denied') {
        complaintSection.style.display = 'block';
        if (issue.isDissatisfied) {
            canFile = true;
            complaintReason = 'declined_unsatisfied';
            complaintInfo.textContent = 'You have expressed dissatisfaction with the rejection. You can now file a Complaint.';
            complaintForm.style.display = 'block';
        } else {
            complaintInfo.textContent = 'This issue has been declined. If you are not satisfied with the reason, you can file a Complaint.';
            dissatisfiedAction.style.display = 'block';
        }
    } 
    // Condition B: Not accepted within 72h
    else if (issue.status === 'pending' && isPast72h) {
        canFile = true;
        complaintReason = 'no_acceptance_72h';
        complaintSection.style.display = 'block';
        complaintInfo.textContent = 'This issue has not been accepted within 72 hours. You are eligible to file a Complaint.';
        complaintForm.style.display = 'block';
    }
    // Condition C: No update within 72h
    else {
        // We need to check the last update time
        try {
            const updatesResponse = await fetch(`${API_URL}/issues/${issue._id}/updates`);
            const updatesData = await updatesResponse.json();
            const lastUpdate = updatesData.updates?.[0];
            const lastTime = lastUpdate ? new Date(lastUpdate.createdAt) : createdAt;
            
            if ((now - lastTime) > seventyTwoHours && issue.status !== 'resolved' && issue.status !== 'denied') {
                canFile = true;
                complaintReason = 'no_update_72h';
                complaintSection.style.display = 'block';
                complaintInfo.textContent = 'There has been no update on this issue for over 72 hours. You are eligible to file a Complaint.';
                complaintForm.style.display = 'block';
            }
        } catch (err) {
            console.error('Error checking updates for Complaint:', err);
        }
    }

    if (canFile) {
        window.currentComplaintReason = complaintReason;
    }
}

// Event Listeners for Complaint
async function handleMarkDissatisfied() {
    const btn = document.getElementById('markDissatisfiedBtn');
    btn.disabled = true;
    btn.textContent = 'Processing...';

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/dissatisfied`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            alert('Marked as dissatisfied. You can now file a Complaint.');
            location.reload();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to mark as dissatisfied');
        }
    } catch (err) {
        console.error('Dissatisfied error:', err);
        alert('Error processing request');
    } finally {
        btn.disabled = false;
        btn.textContent = "No, I'm not satisfied";
    }
}

async function handleSubmitComplaint() {
    const description = document.getElementById('complaintDescription').value;
    const btn = document.getElementById('submitComplaintBtn');
    
    if (!window.currentComplaintReason) {
        alert('Complaint reason not determined.');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting Complaint...';

    try {
        const response = await fetch(`${API_URL}/issues/${currentIssue._id}/complaint`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                reason: window.currentComplaintReason,
                description: description
            })
        });

        const data = await response.json();
        if (response.ok) {
            alert('Complaint Application Submitted Successfully!');
            location.reload();
        } else {
            alert(data.error || 'Failed to submit Complaint');
        }
    } catch (err) {
        console.error('Complaint submission error:', err);
        alert('Error submitting Complaint');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Submit Complaint Application';
    }
}

