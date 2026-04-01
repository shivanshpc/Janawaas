// Authority Dashboard logic
let currentUser = null;
let allIssues = [];
let mergeMode = false;
let selectedIssues = new Set();

async function initDashboard() {
    currentUser = await checkAuth();
    
    if (!currentUser) {
        window.location.href = '/login';
        return;
    }
    
    // Check if user is authority
    if (currentUser.role !== 'authority' && currentUser.role !== 'admin') {
        alert('Access denied. Authority privileges required.');
        window.location.href = '/district';
        return;
    }
    
    await updateNavigation();
    await loadAllIssues();
    await loadAllComplaints();
    await loadMergedIssues();
    setupDashboardEventListeners();
}

async function loadMergedIssues() {
    const mergedContainer = document.getElementById('mergedIssuesContent');
    if (!mergedContainer) return;

    try {
        const token = getToken();
        const authorityId = currentUser.authorityDetails?._id;
        
        if (!authorityId) {
            mergedContainer.innerHTML = '<p class="no-issues">No authority details found.</p>';
            return;
        }

        // Fetch all issues where this authority is involved in a merge request
        const response = await fetch(`${API_URL}/issues?mergeRequestInvolved=${authorityId}&limit=50`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load merge requests');

        const { issues } = await response.json();
        
        // Split into categories
        const pendingReceived = issues.filter(i => 
            i.pendingMergeRequest?.status === 'pending' && 
            (i.pendingMergeRequest?.to?._id === authorityId || i.pendingMergeRequest?.to === authorityId)
        );
        const pendingSent = issues.filter(i => 
            i.pendingMergeRequest?.status === 'pending' && 
            (i.pendingMergeRequest?.from?._id === authorityId || i.pendingMergeRequest?.from === authorityId)
        );
        const activeCollaborations = issues.filter(i => i.pendingMergeRequest?.status === 'accepted');
        
        displayMergedIssues(pendingSent, pendingReceived, activeCollaborations);
    } catch (error) {
        console.error('Error loading merged issues:', error);
        mergedContainer.innerHTML = '<p class="error-message show">Failed to load merge requests.</p>';
    }
}

function displayMergedIssues(sentIssues = [], receivedIssues = [], collaborations = []) {
    const container = document.getElementById('mergedIssuesContent');
    if (!container) return;

    if (sentIssues.length === 0 && receivedIssues.length === 0 && collaborations.length === 0) {
        container.innerHTML = '<p class="no-issues">No pending merge requests or active collaborations found.</p>';
        return;
    }

    let html = '<div class="merged-issues-list" style="display: flex; flex-direction: column; gap: 25px;">';

    // Active Collaborations Section
    if (collaborations.length > 0) {
        html += `
            <div class="request-section">
                <h3 style="margin-bottom: 12px; font-size: 1.1rem; color: var(--primary-color); display: flex; align-items: center; gap: 8px;">
                    🤝 Active Collaborations
                </h3>
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    ${collaborations.map(issue => {
                        const fromAuth = issue.pendingMergeRequest?.from;
                        const toAuth = issue.pendingMergeRequest?.to;
                        const currentAuthId = currentUser.authorityDetails?._id;
                        
                        // Find the other authority
                        const otherAuth = (fromAuth?._id === currentAuthId || fromAuth === currentAuthId) ? toAuth : fromAuth;
                        const otherAuthName = otherAuth?.userId?.displayName || otherAuth?.designation || 'Another Authority';
                        
                        return `
                            <div class="issue-item" onclick="window.location.href='/issue.html?id=${issue._id}'" style="border-left: 4px solid var(--primary-color); background: rgba(var(--primary-rgb), 0.03);">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                    <div style="flex: 1;">
                                        <div class="issue-item-title" style="margin: 0;">${issue.title}</div>
                                        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">
                                            Collaborating with: <strong>${otherAuthName}</strong>
                                        </div>
                                    </div>
                                    <button onclick="event.stopPropagation(); handleUnmergeIssue('${issue._id}')" class="btn btn-secondary" style="font-size: 0.75rem; padding: 4px 12px; background: #fef2f2; color: #ef4444; border: 1px solid #fee2e2;">
                                        End Collaboration
                                    </button>
                                </div>
                                <div style="font-size: 0.85rem; color: var(--text-secondary);">
                                    📍 ${issue.district} | 📅 ${new Date(issue.createdAt).toLocaleDateString()}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // Received Requests Section
    if (receivedIssues.length > 0) {
        html += `
            <div class="request-section">
                <h3 style="margin-bottom: 12px; font-size: 1.1rem; color: #10b981; display: flex; align-items: center; gap: 8px;">
                    📥 Received Requests
                </h3>
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    ${receivedIssues.map(issue => `
                        <div class="issue-item" onclick="window.location.href='/issue.html?id=${issue._id}'" style="border-left: 4px solid #10b981;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                <div style="flex: 1;">
                                    <div class="issue-item-title" style="margin: 0;">${issue.title}</div>
                                    <span class="status-badge status-pending" style="font-size: 0.7rem; padding: 2px 8px;">PENDING MERGE</span>
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button onclick="event.stopPropagation(); handleMergeAction('accept', '${issue._id}')" class="btn btn-primary" style="font-size: 0.75rem; padding: 4px 12px; background: #10b981; border: none;">Accept</button>
                                    <button onclick="event.stopPropagation(); handleMergeAction('reject', '${issue._id}')" class="btn btn-danger" style="font-size: 0.75rem; padding: 4px 12px; background: #ef4444; border: none;">Reject</button>
                                </div>
                            </div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary);">
                                📍 ${issue.district} | 📅 ${new Date(issue.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Sent Requests Section
    if (sentIssues.length > 0) {
        html += `
            <div class="request-section">
                <h3 style="margin-bottom: 12px; font-size: 1.1rem; color: #6366f1; display: flex; align-items: center; gap: 8px;">
                    📤 Sent Requests
                </h3>
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    ${sentIssues.map(issue => `
                        <div class="issue-item" onclick="window.location.href='/issue.html?id=${issue._id}'" style="border-left: 4px solid #6366f1;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                <div style="flex: 1;">
                                    <div class="issue-item-title" style="margin: 0;">${issue.title}</div>
                                    <span class="status-badge status-pending" style="font-size: 0.7rem; padding: 2px 8px;">${(issue.pendingMergeRequest?.status || 'pending').toUpperCase()}</span>
                                </div>
                            </div>
                            <div style="font-size: 0.85rem; color: var(--text-secondary);">
                                📍 ${issue.district} | 📅 ${new Date(issue.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    html += '</div>';
    container.innerHTML = html;
}

async function handleMergeAction(action, issueId) {
    if (!confirm(`Are you sure you want to ${action} this merge request?`)) return;

    try {
        const token = getToken();
        // We need to find the sourceAuthorityId for the request
        const issueRes = await fetch(`${API_URL}/issues/${issueId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const { issue } = await issueRes.json();
        
        if (!issue.pendingMergeRequest || !issue.pendingMergeRequest.from) {
            throw new Error('Merge request details not found');
        }

        const sourceAuthorityId = issue.pendingMergeRequest.from._id || issue.pendingMergeRequest.from;

        const response = await fetch(`${API_URL}/issues/${issueId}/merge-${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ sourceAuthorityId })
        });

        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            await loadMergedIssues();
            await loadAllIssues();
        } else {
            alert(data.error || `Failed to ${action} merge request`);
        }
    } catch (error) {
        console.error(`Error ${action}ing merge request:`, error);
        alert(error.message);
    }
}

async function handleUnmergeIssue(issueId) {
    if (!confirm('Are you sure you want to unmerge this issue? It will be moved back to the pending state.')) {
        return;
    }

    try {
        const token = getToken();
        const response = await fetch(`${API_URL}/issues/${issueId}/unmerge`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (response.ok) {
            alert(data.message);
            await loadAllIssues();
        } else {
            alert(data.error || 'Failed to unmerge issue.');
        }
    } catch (error) {
        console.error('Error unmerging issue:', error);
        alert('Error unmerging issue. Please try again.');
    }
}

async function loadAllComplaints() {
    const complaintsContainer = document.getElementById('complaintsDashboardContent');
    if (!complaintsContainer) return;

    try {
        const token = getToken();
        const response = await fetch(`${API_URL}/issues/complaints/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Failed to load Complaints');

        const { complaints } = await response.json();
        displayComplaints(complaints);
    } catch (error) {
        console.error('Error loading Complaints:', error);
        complaintsContainer.innerHTML = '<p class="error-message show">Failed to load Complaints.</p>';
    }
}

function displayComplaints(complaints) {
    const container = document.getElementById('complaintsDashboardContent');
    if (!container) return;

    if (!complaints || complaints.length === 0) {
        container.innerHTML = '<p class="no-issues">No Complaints filed in your jurisdiction.</p>';
        return;
    }

    const reasonMap = {
        declined_unsatisfied: 'Declined and Unsatisfied',
        no_acceptance_72h: 'No Acceptance within 72h',
        no_update_72h: 'No Update within 72h'
    };

    container.innerHTML = `
        <div class="complaints-list" style="display: flex; flex-direction: column; gap: 15px;">
            ${complaints.map(complaint => `
                <div class="issue-item" onclick="window.location.href='/issue/${complaint.issueId?._id}'" style="border-left: 4px solid #f59e0b;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <div class="issue-item-title" style="margin: 0;">Complaint: ${complaint.complaintReferenceNumber}</div>
                        <span class="status-badge status-${complaint.status}" style="font-size: 0.7rem; padding: 2px 8px;">${complaint.status.toUpperCase()}</span>
                    </div>
                    <div style="font-size: 0.85rem; margin-bottom: 8px;">
                        <strong>For Issue:</strong> ${complaint.issueId?.title || 'Unknown'}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px;">
                        <strong>Filed By:</strong> ${complaint.filedBy?.displayName} (@${complaint.filedBy?.username})
                    </div>
                    <div style="font-size: 0.85rem; color: #f59e0b; font-weight: 500;">
                        <strong>Reason:</strong> ${reasonMap[complaint.reason] || complaint.reason}
                    </div>
                    <div class="issue-item-meta" style="margin-top: 10px; border-top: 1px solid var(--border-color); pt: 8px;">
                        <span>📍 ${complaint.issueId?.district || ''}</span>
                        <span>📅 ${new Date(complaint.createdAt).toLocaleDateString()}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function setupDashboardEventListeners() {
    const enableMergeBtn = document.getElementById('enableMergeModeBtn');
    const cancelMergeBtn = document.getElementById('cancelMergeBtn');
    const confirmMergeBtn = document.getElementById('confirmMergeBtn');
    const mergeActions = document.getElementById('mergeActions');

    // Tab switching for dashboard
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanes.forEach(pane => pane.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(`tab-${targetTab}`).classList.add('active');
        });
    });

    if (enableMergeBtn) {
        enableMergeBtn.addEventListener('click', () => {
            mergeMode = true;
            selectedIssues.clear();
            enableMergeBtn.style.display = 'none';
            mergeActions.style.display = 'flex';
            displayGroupedIssues(allIssues);
        });
    }

    if (cancelMergeBtn) {
        cancelMergeBtn.addEventListener('click', () => {
            mergeMode = false;
            selectedIssues.clear();
            enableMergeBtn.style.display = 'block';
            mergeActions.style.display = 'none';
            displayGroupedIssues(allIssues);
        });
    }

    if (confirmMergeBtn) {
        confirmMergeBtn.addEventListener('click', handleMergeIssues);
    }
}

async function handleMergeIssues() {
    if (selectedIssues.size < 2) {
        alert('Please select at least 2 issues to merge.');
        return;
    }

    const issuesToMerge = Array.from(selectedIssues).map(id => allIssues.find(i => i._id === id));
    
    // Validate they are in the same district
    const districts = new Set(issuesToMerge.map(i => i.district));
    if (districts.size > 1) {
        alert('All issues must be from the same district to merge.');
        return;
    }

    // Ask which one should be the primary issue
    const options = issuesToMerge.map((i, idx) => `${idx + 1}. ${i.title}`).join('\n');
    const primaryIdxStr = prompt(`Which issue should be the PRIMARY issue? (Enter the number 1-${issuesToMerge.length})\n\n${options}`, '1');
    
    const primaryIdx = parseInt(primaryIdxStr) - 1;
    if (isNaN(primaryIdx) || primaryIdx < 0 || primaryIdx >= issuesToMerge.length) {
        alert('Invalid selection.');
        return;
    }

    const primaryIssue = issuesToMerge[primaryIdx];
    const secondaryIssueIds = issuesToMerge
        .filter((_, idx) => idx !== primaryIdx)
        .map(i => i._id);

    if (confirm(`Merge ${secondaryIssueIds.length} issues into "${primaryIssue.title}"? This cannot be undone.`)) {
        try {
            const token = getToken();
            const response = await fetch(`${API_URL}/issues/merge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    primaryIssueId: primaryIssue._id,
                    secondaryIssueIds: secondaryIssueIds
                })
            });

            const data = await response.json();
            if (response.ok) {
                alert(data.message);
                // Reset merge mode
                mergeMode = false;
                selectedIssues.clear();
                document.getElementById('enableMergeModeBtn').style.display = 'block';
                document.getElementById('mergeActions').style.display = 'none';
                await loadAllIssues();
            } else {
                alert(data.error || 'Failed to merge issues.');
            }
        } catch (error) {
            console.error('Error merging issues:', error);
            alert('Error merging issues. Please try again.');
        }
    }
}

async function loadAllIssues() {
    const dashboardContent = document.getElementById('dashboardContent');
    dashboardContent.innerHTML = '<div class="loading">Loading issues...</div>';

    try {
        const token = getToken();
        
        const params = new URLSearchParams();
        params.append('limit', '100');
        
        // Add authority-specific filters if applicable
        if (currentUser.role === 'authority' && currentUser.authorityDetails) {
            const { jurisdictionDistrict, areaOfExpertise, mergedAuthorities = [], _id } = currentUser.authorityDetails;
            
            // Add involvement filter to fetch collaborated issues
            params.append('mergeRequestInvolved', _id);

            const districts = new Set();
            if (jurisdictionDistrict) districts.add(jurisdictionDistrict);
            
            const expertiseList = new Set();
            if (areaOfExpertise && areaOfExpertise !== 'Others') expertiseList.add(areaOfExpertise);
            
            // Add merged authorities' districts and expertise
            mergedAuthorities.forEach(merged => {
                if (merged.jurisdictionDistrict) districts.add(merged.jurisdictionDistrict);
                if (merged.areaOfExpertise && merged.areaOfExpertise !== 'Others') expertiseList.add(merged.areaOfExpertise);
            });
            
            if (districts.size > 0) {
                params.append('district', Array.from(districts).join(','));
            }
            
            if (expertiseList.size > 0) {
                const categories = new Set();
                const categoryMapping = {
                    'Roads & Potholes': 'roads',
                    'Sanitation & Waste': 'garbage',
                    'Water Supply': 'water',
                    'Sewer & Drainage': 'drainage',
                    'Electricity': 'electricity',
                    'Street Lighting': 'streetlight'
                };
                
                expertiseList.forEach(expertise => {
                    const normalizedExpertise = expertise.trim();
                    const issueCategory = categoryMapping[normalizedExpertise];
                    
                    if (issueCategory) {
                        categories.add(issueCategory);
                    } else {
                        const lowerExpertise = normalizedExpertise.toLowerCase();
                        if (lowerExpertise.includes('water')) categories.add('water');
                        else if (lowerExpertise.includes('road') || lowerExpertise.includes('pothole')) categories.add('roads');
                        else if (lowerExpertise.includes('waste') || lowerExpertise.includes('sanitation') || lowerExpertise.includes('garbage')) categories.add('garbage');
                        else if (lowerExpertise.includes('drain') || lowerExpertise.includes('sewer')) categories.add('drainage');
                        else if (lowerExpertise.includes('elect')) categories.add('electricity');
                        else if (lowerExpertise.includes('light')) categories.add('streetlight');
                    }
                });
                
                if (categories.size > 0) {
                    params.append('category', Array.from(categories).join(','));
                }
            }
        }

        const response = await fetch(`${API_URL}/issues?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to load issues');

        const data = await response.json();
        allIssues = data.issues;
        
        displayGroupedIssues(allIssues);
        updateDashboardStats(allIssues);
    } catch (error) {
        console.error('Error loading issues:', error);
        dashboardContent.innerHTML = '<p class="error-message show">Failed to load issues. Please try again.</p>';
    }
}

function displayGroupedIssues(issues) {
    const dashboardContent = document.getElementById('dashboardContent');
    
    if (issues.length === 0) {
        dashboardContent.innerHTML = '<p class="no-issues">No issues reported yet.</p>';
        return;
    }

    // Group issues by district
    const groupedByDistrict = issues.reduce((acc, issue) => {
        const district = issue.district || 'Unknown District';
        if (!acc[district]) acc[district] = [];
        acc[district].push(issue);
        return acc;
    }, {});

    dashboardContent.innerHTML = '';

    // Create a group for each district
    Object.keys(groupedByDistrict).sort().forEach(district => {
        const districtIssues = groupedByDistrict[district];
        const districtEl = document.createElement('div');
        districtEl.className = 'district-group';
        
        // Group district issues by status
        const byStatus = {
            pending: districtIssues.filter(i => i.status === 'pending'),
            in_progress: districtIssues.filter(i => i.status === 'in_progress' || i.status === 'accepted'),
            resolved: districtIssues.filter(i => i.status === 'resolved'),
            denied: districtIssues.filter(i => i.status === 'denied')
        };

        districtEl.innerHTML = `
            <div class="district-header">
                <h2>📍 ${district}</h2>
                <span class="status-count">${districtIssues.length} issues</span>
            </div>
            <div class="status-groups">
                ${renderStatusColumn('Pending', 'pending', byStatus.pending)}
                ${renderStatusColumn('In Progress', 'in_progress', byStatus.in_progress)}
                ${renderStatusColumn('Resolved', 'resolved', byStatus.resolved)}
            </div>
        `;
        
        dashboardContent.appendChild(districtEl);
    });
}

function renderStatusColumn(label, statusKey, issues) {
    const statusIcons = {
        pending: '⏳',
        in_progress: '🏗️',
        resolved: '✅',
        denied: '🚫'
    };

    let issuesHtml = issues.map(issue => {
        const isSelected = selectedIssues.has(issue._id);
        const mergeCheckbox = mergeMode ? `
            <div class="merge-checkbox-container" onclick="event.stopPropagation()">
                <input type="checkbox" id="merge-${issue._id}" ${isSelected ? 'checked' : ''} onchange="toggleIssueSelection('${issue._id}')">
            </div>
        ` : '';

        const unmergeBtn = (!mergeMode && issue.isMerged) ? `
            <button onclick="event.stopPropagation(); handleUnmergeIssue('${issue._id}')" style="background: none; border: none; font-size: 0.8rem; cursor: pointer; color: var(--text-secondary); margin-left: auto;" title="Unmerge Issue">🔓</button>
        ` : '';

        return `
            <div class="issue-item ${isSelected ? 'selected' : ''}" onclick="${mergeMode ? `toggleIssueSelection('${issue._id}')` : `window.location.href='/issue.html?id=${issue._id}'`}">
                <div style="display: flex; gap: 10px; align-items: flex-start;">
                    ${mergeCheckbox}
                    <div style="flex: 1;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div class="issue-item-title">${issue.title}</div>
                            ${unmergeBtn}
                        </div>
                        <div class="issue-item-meta">
                            <span>👤 @${issue.reportedBy?.username || 'anonymous'}</span>
                            <span>👍 ${issue.upvoteCount}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (issues.length === 0) {
        issuesHtml = '<div class="empty-column">No issues</div>';
    }

    return `
        <div class="status-column">
            <div class="status-column-header">
                <span>${statusIcons[statusKey]}</span>
                <span>${label}</span>
                <span class="status-count">${issues.length}</span>
            </div>
            ${issuesHtml}
        </div>
    `;
}

function toggleIssueSelection(id) {
    if (selectedIssues.has(id)) {
        selectedIssues.delete(id);
    } else {
        selectedIssues.add(id);
    }
    displayGroupedIssues(allIssues);
}

window.toggleIssueSelection = toggleIssueSelection; // Make it global for onclick/onchange

function updateDashboardStats(issues) {
    const stats = {
        total: issues.length,
        pending: issues.filter(i => i.status === 'pending').length,
        inProgress: issues.filter(i => i.status === 'in_progress' || i.status === 'accepted').length,
        resolved: issues.filter(i => i.status === 'resolved').length
    };

    document.getElementById('statTotal').textContent = stats.total.toLocaleString();
    document.getElementById('statPending').textContent = stats.pending.toLocaleString();
    document.getElementById('statInProgress').textContent = stats.inProgress.toLocaleString();
    document.getElementById('statResolved').textContent = stats.resolved.toLocaleString();

    displayMergedAuthorities();
}

function displayMergedAuthorities() {
    if (!currentUser || !currentUser.authorityDetails) return;
    
    const mergedAuths = currentUser.authorityDetails.mergedAuthorities || [];
    const container = document.getElementById('mergedAuthoritiesContainer');
    
    if (!container) {
        // Create container if it doesn't exist
        const statsGrid = document.querySelector('.stats-grid');
        if (statsGrid) {
            const mergedDiv = document.createElement('div');
            mergedDiv.id = 'mergedAuthoritiesContainer';
            mergedDiv.className = 'merged-authorities-section';
            mergedDiv.style.marginTop = '20px';
            mergedDiv.style.padding = '20px';
            mergedDiv.style.background = 'var(--card-bg)';
            mergedDiv.style.borderRadius = '12px';
            mergedDiv.style.border = '1px solid var(--border-color)';
            statsGrid.parentNode.insertBefore(mergedDiv, statsGrid.nextSibling);
        }
    }

    const targetContainer = document.getElementById('mergedAuthoritiesContainer');
    if (!targetContainer) return;

    if (mergedAuths.length === 0) {
        targetContainer.style.display = 'none';
        return;
    }

    targetContainer.style.display = 'block';
    targetContainer.innerHTML = `
        <h3 style="margin-bottom: 15px; font-size: 1.1rem; color: var(--text-primary);">🤝 Merged Authorities</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 15px;">
            ${mergedAuths.map(auth => `
                <div style="background: var(--bg-light); padding: 10px 15px; border-radius: 8px; border: 1px solid var(--border-color); display: flex; align-items: center; gap: 12px;">
                    <div>
                        <div style="font-weight: 600; font-size: 0.9rem;">${auth.designation}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">${auth.areaOfExpertise} - ${auth.jurisdictionDistrict}</div>
                    </div>
                    <button onclick="handleUnmergeDashboard('${auth._id}')" style="background: #ff4757; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; cursor: pointer; font-weight: bold;">Unmerge</button>
                </div>
            `).join('')}
        </div>
    `;
}

async function handleUnmergeDashboard(targetAuthId) {
    if (!confirm('Are you sure you want to unmerge issues with this authority?')) return;
    
    try {
        const token = getToken();
        const response = await fetch(`${API_URL}/authority/unmerge/${targetAuthId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        
        alert('Authorities unmerged successfully!');
        location.reload();
    } catch (error) {
        console.error('Unmerge failed:', error);
        alert(error.message);
    }
}

function setupEventListeners() {
    // Add any dashboard-specific listeners here
}

document.addEventListener('DOMContentLoaded', initDashboard);
