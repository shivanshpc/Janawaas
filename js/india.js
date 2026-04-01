// India Feed page logic
// Note: Using separate variable names to avoid conflicts with feed.js

let indiaCurrentPage = 1;
let indiaCurrentFilter = 'hot';
let indiaIsLoading = false;
let indiaHasMore = true;
const INDIA_PAGE_SIZE = 20;

// Initialize India feed page
async function initIndiaFeed() {
    currentUser = await checkAuth();
    
    // Redirect authorities away from India Feed
    if (currentUser && currentUser.role === 'authority') {
        window.location.href = '/authority-dashboard';
        return;
    }
    
    // Update navigation
    await updateNavigation();
    
    // Load initial issues
    await loadIndiaIssues();
    
    // Setup event listeners
    setupIndiaEventListeners();
    
    // Load and display stats
    loadIndiaStats();
}

// Load India feed statistics
async function loadIndiaStats() {
    try {
        const res = await fetch(`${API_URL}/stats/overview`);
        if (!res.ok) return;
        
        const data = await res.json();
        
        // Update stats display if elements exist
        const statNational = document.getElementById('statNational');
        const statMonthly = document.getElementById('statMonthly');
        
        if (statNational && data.totalIssues !== undefined) {
            statNational.textContent = data.totalIssues.toLocaleString();
        }
        if (statMonthly && data.resolvedIssuesThisMonth !== undefined) {
            statMonthly.textContent = data.resolvedIssuesThisMonth.toLocaleString();
        }
    } catch (e) {
        console.error('Error loading India stats:', e);
    }
}

// Load India feed issues
async function loadIndiaIssues(append = false) {
    if (indiaIsLoading) return;
    indiaIsLoading = true;

    const params = new URLSearchParams();
    params.append('filter', indiaCurrentFilter);
    params.append('page', indiaCurrentPage);
    params.append('limit', INDIA_PAGE_SIZE);

    // Show loading indicator
    if (!append) {
        document.getElementById('issuesFeed').innerHTML = '<div class="loading">Loading issues...</div>';
    } else {
        showLoadingIndicator();
    }

    try {
        const headers = {};
        if (getToken()) {
            headers['Authorization'] = `Bearer ${getToken()}`;
        }
        
        const response = await fetch(`${API_URL}/issues/feed/india?${params}`, {
            headers: headers
        });

        if (!response.ok) throw new Error('Failed to load India feed');

        const data = await response.json();
        
        let indiaIssues;
        if (append) {
            indiaIssues = [...(allIssues || []), ...data.issues];
        } else {
            indiaIssues = data.issues;
        }
        allIssues = indiaIssues;
        
        indiaHasMore = data.pagination.hasMore;
        displayIndiaIssues(allIssues);
        updateFeedDescription();
        hideLoadingIndicator();
    } catch (error) {
        console.error('Error loading India feed:', error);
        document.getElementById('issuesFeed').innerHTML = 
            '<p class="error-message show">Failed to load issues. Please try again.</p>';
    } finally {
        indiaIsLoading = false;
    }
}

// Update feed description based on current filter
function updateFeedDescription() {
    const descriptions = {
        'hot': 'Showing hottest issues based on upvotes and recency',
        'trending': 'Showing fastest growing issues in last 24 hours',
        'new': 'Showing newest issues first',
        'top': 'Showing all-time top issues by upvotes'
    };
    
    const descEl = document.getElementById('feedDescription');
    if (descEl) {
        descEl.textContent = descriptions[indiaCurrentFilter] || descriptions['hot'];
    }
}

// Display India feed issues
function displayIndiaIssues(issues) {
    const feed = document.getElementById('issuesFeed');

    if (!issues || issues.length === 0) {
        feed.innerHTML = '<p class="no-issues">No issues found. Be the first to report one!</p>';
        return;
    }

    feed.innerHTML = issues.map(issue => {
        const authorName = issue.reportedBy?.displayName || issue.reportedBy?.name || 'Anonymous';
        const authorUsername = issue.reportedBy?.username || '';
        const avatarLetter = authorName.charAt(0).toUpperCase();
        const isVerifiedAuthor = issue.reportedBy?.isAadhaarVerified || issue.reportedBy?.isVerified;
        return `
        <div class="issue-card">
            <div class="issue-card-top">
                <div class="issue-avatar" onclick="event.stopPropagation(); ${authorUsername ? `window.location='/profile/${authorUsername}'` : 'return false;'}">${avatarLetter}</div>
                <div class="issue-card-body">
                    <div class="issue-card-author-row">
                        <span class="issue-author-name">${authorUsername ? `<a href="/profile/${authorUsername}" onclick="event.stopPropagation()">${authorName}</a>` : authorName}</span>
                        ${isVerifiedAuthor ? '<span class="verified-badge">✓</span>' : ''}
                        ${authorUsername ? `<span class="issue-author-handle"><a href="/profile/${authorUsername}" onclick="event.stopPropagation()">@${authorUsername}</a></span>` : ''}
                        <span class="issue-time-dot">·</span>
                        <span class="issue-time-dot">${getTimeAgo(issue.createdAt)}</span>
                    </div>
                    <span class="issue-category-badge">${getCategoryIcon(issue.category)} ${issue.category}</span>
                    ${issue.severityScore ? `<span class="severity-badge" style="margin-left:6px;" title="Severity">⚡ ${issue.severityScore.toFixed(1)}</span>` : ''}
                    <div class="issue-card-title"><a href="/issue/${issue._id}" onclick="event.stopPropagation()">${issue.title}</a></div>
                    <p class="issue-description">${issue.description.substring(0, 160)}${issue.description.length > 160 ? '...' : ''}</p>
                    <div class="issue-card-meta">
                        <span>📍 ${issue.district}${issue.state ? ', ' + issue.state : ''}</span>
                        <span class="status-badge status-${issue.status}">${formatStatus(issue.status)}</span>
                    </div>
                    <div class="issue-card-actions">
                        <button class="issue-action-btn" data-issue-id="${issue._id}" data-action="comment">💬 Comment</button>
                        <button class="issue-action-btn" data-issue-id="${issue._id}" data-action="upvote">👍 ${issue.upvoteCount} ${issue.upvoteCount === 1 ? 'upvote' : 'upvotes'}</button>
                        <button class="issue-action-btn" data-issue-id="${issue._id}" data-action="share">🔗 Share</button>
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
    
    feed.innerHTML += '<div id="loadingIndicator" style="display: none;"></div>';
    
    // Show end message if no more issues
    if (!indiaHasMore && (allIssues || []).length > 0) {
        feed.innerHTML += '<div class="end-of-feed">You\'ve reached the end of the feed</div>';
    }
}

// Setup event listeners for India feed
function setupIndiaEventListeners() {
    // Tab filter buttons
    const tabBtns = document.querySelectorAll('.feed-tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active button
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Load issues with new filter
            indiaCurrentFilter = btn.dataset.filter;
            indiaCurrentPage = 1;
            indiaHasMore = true;
            loadIndiaIssues(false);
        });
    });

    // Issue feed action buttons (event delegation)
    const feed = document.getElementById('issuesFeed');
    if (feed) {
        feed.addEventListener('click', (e) => {
            const button = e.target.closest('.issue-action-btn');
            if (!button) return;
            
            e.stopPropagation();
            
            const action = button.dataset.action;
            const issueId = button.dataset.issueId;
            
            if (!issueId) return;
            
            if (action === 'comment') {
                window.location.href = `/issue/${issueId}#comments`;
            } else if (action === 'upvote') {
                handleUpvote(issueId, button);
            } else if (action === 'share') {
                const issueCard = button.closest('.issue-card');
                handleShare(issueId, issueCard);
            }
        });
    }

    // Infinite scroll
    window.addEventListener('scroll', handleIndiaInfiniteScroll);
}

// Handle infinite scroll for India feed
function handleIndiaInfiniteScroll() {
    if (indiaIsLoading || !indiaHasMore) return;
    
    const feed = document.getElementById('issuesFeed');
    if (!feed) return;
    
    const { bottom } = feed.getBoundingClientRect();
    const isNearBottom = bottom < window.innerHeight + 300;
    
    if (isNearBottom) {
        indiaCurrentPage++;
        loadIndiaIssues(true);
    }
}

// Real-time integration
if (typeof realtimeManager !== 'undefined') {
    realtimeManager.onIssueUpvoted((data) => {
        const upvoteBtn = document.querySelector(`button[data-issue-id="${data.issueId}"][data-action="upvote"]`);
        if (upvoteBtn) {
            upvoteBtn.textContent = `👍 ${data.upvotes} ${data.upvotes === 1 ? 'upvote' : 'upvotes'}`;
        }
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIndiaFeed);
} else {
    initIndiaFeed();
}