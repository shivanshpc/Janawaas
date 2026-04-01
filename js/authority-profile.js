// Authority Profile Page

// Safe token getter
function getToken() {
    try {
        return localStorage.getItem('token');
    } catch (e) {
        console.warn('localStorage access denied:', e);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');

    if (!userId) {
        // If no userId provided, load current user's authority profile
        loadCurrentUserAuthority();
    } else {
        // Load specific authority profile
        loadAuthorityProfile(userId);
    }
});

// Load current user's authority profile
async function loadCurrentUserAuthority() {
    try {
        // First get current user info
        const userResponse = await fetch('/api/users/profile', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!userResponse.ok) {
            showError();
            return;
        }

        const userData = await userResponse.json();
        
        if (userData.user.role !== 'authority') {
            showError();
            return;
        }

        // Then get authority details
        loadAuthorityProfile(userData.user._id);
    } catch (error) {
        console.error('Error loading user profile:', error);
        showError();
    }
}

// Load authority profile by userId
async function loadAuthorityProfile(userId) {
    try {
        const response = await fetch(`/api/users/${userId}/authority`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            showError();
            return;
        }

        const data = await response.json();
        displayAuthorityProfile(data.authority);
        loadRecentActivity(userId);
    } catch (error) {
        console.error('Error loading authority profile:', error);
        showError();
    }
}

// Display authority profile
function displayAuthorityProfile(authority) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('profileContent').style.display = 'block';

    // Profile info
    const nameInitial = authority.userId.name.charAt(0).toUpperCase();
    document.getElementById('profileAvatar').textContent = nameInitial;
    document.getElementById('profileName').textContent = authority.userId.name;
    document.getElementById('profileDesignation').textContent = authority.designation;
    document.getElementById('profileDepartment').textContent = authority.department;
    document.getElementById('profileDistrict').textContent = authority.jurisdictionDistrict;
    document.getElementById('profileState').textContent = authority.jurisdictionState;

    // Badge
    const badgeElement = document.getElementById('profileBadge');
    const badgeMap = {
        gold: { text: '🏆 Gold Badge', class: 'badge-gold' },
        silver: { text: '🥈 Silver Badge', class: 'badge-silver' },
        bronze: { text: '🥉 Bronze Badge', class: 'badge-bronze' },
        none: { text: 'No Badge', class: 'badge-none' }
    };
    
    const badge = badgeMap[authority.badge] || badgeMap.none;
    badgeElement.textContent = badge.text;
    badgeElement.className = `badge-container ${badge.class}`;

    // Statistics
    document.getElementById('statAccepted').textContent = authority.issuesAccepted || 0;
    document.getElementById('statResolved').textContent = authority.issuesResolved || 0;
    document.getElementById('statRating').textContent = authority.averageRating 
        ? authority.averageRating.toFixed(1) 
        : '0.0';
}

// Load recent activity
async function loadRecentActivity(userId) {
    try {
        const response = await fetch(`/api/issues?authorityId=${userId}&limit=5`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            return;
        }

        const data = await response.json();
        displayRecentActivity(data.issues || []);
    } catch (error) {
        console.error('Error loading recent activity:', error);
    }
}

// Display recent activity
function displayRecentActivity(issues) {
    const container = document.getElementById('recentActivityList');

    if (!issues || issues.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">No recent activity</p>';
        return;
    }

    container.innerHTML = issues.map(issue => {
        const statusEmoji = {
            pending: '⏳',
            'in-progress': '🔄',
            resolved: '✅',
            rejected: '❌'
        };

        return `
            <div class="activity-item">
                <div class="activity-title">
                    ${statusEmoji[issue.status] || '📋'} ${issue.title}
                </div>
                <div class="activity-meta">
                    Status: <strong>${issue.status}</strong> • 
                    ${issue.category} • 
                    Updated ${formatRelativeTime(issue.updatedAt)}
                </div>
            </div>
        `;
    }).join('');
}

// Show error state
function showError() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
}

// Format relative time
function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    
    return date.toLocaleDateString();
}
