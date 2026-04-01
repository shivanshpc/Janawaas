// Admin dashboard logic
// API_URL is defined in auth.js
let currentUser = null;
let currentUsersPage = 1;
let currentIssuesPage = 1;
let currentAuthoritiesPage = 1;
let currentModerationPage = 1;

// Initialize admin dashboard
async function initAdmin() {
    currentUser = await checkAuth();
    
    if (!currentUser) {
        window.location.href = '/login';
        return;
    }
    
    // Check if user is admin
    if (currentUser.role !== 'admin') {
        alert('Access denied. Admin privileges required.');
        window.location.href = '/district';
        return;
    }
    
    await loadStats();
    
    // Check for tab in URL hash
    const hash = window.location.hash.replace('#', '');
    if (hash) {
        await switchTab(hash);
    } else {
        await loadUsers();
    }
    
    setupEventListeners();
}

// Load dashboard statistics
async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/admin/stats`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load stats');
        
        const data = await response.json();
        displayStats(data.stats);
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Display statistics
function displayStats(stats) {
    document.getElementById('totalUsers').textContent = stats.totalUsers;
    document.getElementById('totalIssues').textContent = stats.totalIssues;
    document.getElementById('pendingIssues').textContent = stats.pendingIssues;
    document.getElementById('resolvedIssues').textContent = stats.resolvedIssues;
    document.getElementById('bannedUsers').textContent = stats.bannedUsers;
    document.getElementById('unverifiedAuthorities').textContent = stats.unverifiedAuthorities;
    // Populate right sidebar stats
    const sidebarFields = {
        sidebarTotalUsers: stats.totalUsers,
        sidebarTotalIssues: stats.totalIssues,
        sidebarPending: stats.pendingIssues,
        sidebarResolved: stats.resolvedIssues
    };
    for (const [id, val] of Object.entries(sidebarFields)) {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    }
}

// Load users
async function loadUsers(page = 1) {
    try {
        const role = document.getElementById('userRoleFilter')?.value || '';
        const banned = document.getElementById('userBannedFilter')?.value || '';
        const search = document.getElementById('userSearch')?.value || '';
        const district = document.getElementById('userDistrictSearch')?.value || '';
        
        const params = new URLSearchParams();
        if (role) params.append('role', role);
        if (banned) params.append('banned', banned);
        if (search) params.append('search', search);
        if (district) params.append('district', district);
        params.append('page', page);
        params.append('limit', 20);
        
        const response = await fetch(`${API_URL}/admin/users?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load users');
        
        const data = await response.json();
        displayUsers(data.users);
        displayPagination('users', data.pagination);
        currentUsersPage = page;
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('usersTableBody').innerHTML = 
            '<tr><td colspan="7" class="error-message">Failed to load users</td></tr>';
    }
}

// Display users
function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');
    
    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No users found</td></tr>';
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td><strong>${user.username}</strong></td>
            <td>${user.email}</td>
            <td><span class="badge badge-${user.role}">${user.role}</span></td>
            <td>${user.district || 'N/A'}</td>
            <td>${user.isBanned ? '<span class="badge badge-danger">Banned</span>' : '<span class="badge badge-success">Active</span>'}</td>
            <td>${user.isVerified ? '<span class="badge badge-primary">✓ Verified</span>' : '<span class="badge badge-secondary">Unverified</span>'}</td>
            <td class="actions">
                ${user.role !== 'admin' ? `
                    ${!user.isBanned ? 
                        `<button class="btn-action btn-danger" onclick="banUser('${user._id}')">Ban</button>` :
                        `<button class="btn-action btn-success" onclick="unbanUser('${user._id}')">Unban</button>`
                    }
                ` : '<span class="text-muted">Protected</span>'}
                ${user.role === 'authority' && !user.isVerified ? 
                    `<button class="btn-action btn-primary" onclick="verifyUser('${user._id}')">Verify</button>` : ''}
                <button class="btn-action btn-secondary" onclick="window.location.href='/profile/${user.username}?admin=true'">View</button>
            </td>
        </tr>
    `).join('');
}

// Load issues
async function loadIssues(page = 1) {
    try {
        const status = document.getElementById('issueStatusFilter')?.value || '';
        const featured = document.getElementById('issueFeaturedFilter')?.value || '';
        const search = document.getElementById('issueSearch')?.value || '';
        const district = document.getElementById('issueDistrictSearch')?.value || '';
        
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (featured) params.append('featured', featured);
        if (search) params.append('search', search);
        if (district) params.append('district', district);
        params.append('page', page);
        params.append('limit', 20);
        
        const response = await fetch(`${API_URL}/admin/issues?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load issues');
        
        const data = await response.json();
        displayIssues(data.issues);
        displayPagination('issues', data.pagination);
        currentIssuesPage = page;
    } catch (error) {
        console.error('Error loading issues:', error);
        document.getElementById('issuesTableBody').innerHTML = 
            '<tr><td colspan="7" class="error-message">Failed to load issues</td></tr>';
    }
}

// Display issues
function displayIssues(issues) {
    const tbody = document.getElementById('issuesTableBody');
    
    if (!issues || issues.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No issues found</td></tr>';
        return;
    }
    
    tbody.innerHTML = issues.map(issue => `
        <tr>
            <td>
                <a href="/issue/${issue._id}?admin=true" target="_blank">${issue.title}</a>
            </td>
            <td><span class="badge">${issue.category}</span></td>
            <td>${issue.reportedBy?.username || 'N/A'}</td>
            <td><span class="status-badge status-${issue.status}">${formatStatus(issue.status)}</span></td>
            <td>${issue.upvoteCount}</td>
            <td>${issue.isFeatured ? '<span class="badge badge-warning">⭐ Featured</span>' : ''}</td>
            <td class="actions">
                ${!issue.isFeatured ?
                    `<button class="btn-action btn-warning" onclick="featureIssue('${issue._id}')">Feature</button>` :
                    `<button class="btn-action btn-secondary" onclick="unfeatureIssue('${issue._id}')">Unfeature</button>`
                }
                <button class="btn-action btn-primary" onclick="window.location.href='/issue/${issue._id}?admin=true'">View</button>
                <button class="btn-action btn-danger" onclick="deleteIssue('${issue._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

// Load authorities
async function loadAuthorities(page = 1) {
    try {
        const verified = document.getElementById('authorityVerifiedFilter')?.value || '';
        const search = document.getElementById('authoritySearch')?.value || '';
        const district = document.getElementById('authorityDistrictSearch')?.value || '';
        
        const params = new URLSearchParams();
        params.append('role', 'authority');
        if (verified) params.append('verified', verified);
        if (search) params.append('search', search);
        if (district) params.append('district', district);
        params.append('page', page);
        params.append('limit', 20);
        
        const response = await fetch(`${API_URL}/admin/users?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load authorities');
        
        const data = await response.json();
        displayAuthorities(data.users);
        displayPagination('authorities', data.pagination);
        currentAuthoritiesPage = page;
    } catch (error) {
        console.error('Error loading authorities:', error);
        document.getElementById('authoritiesTableBody').innerHTML = 
            '<tr><td colspan="7" class="error-message">Failed to load authorities</td></tr>';
    }
}

// Display authorities
function displayAuthorities(authorities) {
    const tbody = document.getElementById('authoritiesTableBody');
    
    if (!authorities || authorities.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No authorities found</td></tr>';
        return;
    }
    
    tbody.innerHTML = authorities.map(auth => `
        <tr>
            <td><strong>${auth.username}</strong></td>
            <td>${auth.email}</td>
            <td>${auth.district || 'N/A'}</td>
            <td>${auth.state || 'N/A'}</td>
            <td>${auth.isVerified ? '<span class="badge badge-success">✓ Verified</span>' : '<span class="badge badge-warning">⚠ Unverified</span>'}</td>
            <td>${auth.isBanned ? '<span class="badge badge-danger">Banned</span>' : '<span class="badge badge-success">Active</span>'}</td>
            <td class="actions">
                ${!auth.isVerified ?
                    `<button class="btn-action btn-primary" onclick="verifyUser('${auth._id}')">Verify</button>` :
                    `<button class="btn-action btn-secondary" onclick="unverifyUser('${auth._id}')">Unverify</button>`
                }
                ${!auth.isBanned ?
                    `<button class="btn-action btn-danger" onclick="banUser('${auth._id}')">Ban</button>` :
                    `<button class="btn-action btn-success" onclick="unbanUser('${auth._id}')">Unban</button>`
                }
            </td>
        </tr>
    `).join('');
}

// Load moderation (flagged issues)
async function loadModeration(page = 1) {
    try {
        const params = new URLSearchParams();
        params.append('page', page);
        params.append('limit', 20);
        
        const response = await fetch(`${API_URL}/admin/moderation?${params}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load flagged issues');
        
        const data = await response.json();
        displayModeration(data.flaggedIssues);
        displayPagination('moderation', data.pagination);
        currentModerationPage = page;
    } catch (error) {
        console.error('Error loading flagged issues:', error);
        document.getElementById('moderationTableBody').innerHTML = 
            '<tr><td colspan="7" class="error-message">Failed to load flagged issues</td></tr>';
    }
}

// Display moderation (flagged issues)
function displayModeration(issues) {
    const tbody = document.getElementById('moderationTableBody');
    
    if (!issues || issues.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No flagged issues found</td></tr>';
        return;
    }
    
    tbody.innerHTML = issues.map(issue => `
        <tr>
            <td><strong>${issue.title}</strong></td>
            <td>${issue.reportedBy?.username || 'Unknown'}</td>
            <td>${issue.flagReason || 'No reason provided'}</td>
            <td>${issue.district || 'N/A'}</td>
            <td><span class="badge badge-${getStatusColor(issue.status)}">${capitalize(issue.status)}</span></td>
            <td>${new Date(issue.createdAt).toLocaleDateString()}</td>
            <td class="actions">
                <button class="btn-action btn-primary" onclick="window.location.href='/issue/${issue._id}?admin=true'">View</button>
                <button class="btn-action btn-danger" onclick="deleteIssueFromModeration('${issue._id}')">Delete</button>
                <button class="btn-action btn-secondary" onclick="banUser('${issue.reportedBy?._id}')">Ban User</button>
            </td>
        </tr>
    `).join('');
}

// Load reports
async function loadReports(page = 1) {
    try {
        const status = document.getElementById('reportStatusFilter')?.value || '';
        const type = document.getElementById('reportTypeFilter')?.value || '';
        const search = document.getElementById('reportSearch')?.value || '';
        
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (type) params.append('targetType', type);
        if (search) params.append('search', search);
        params.append('page', page);
        params.append('limit', 20);
        
        const response = await fetch(`${API_URL}/admin/reports?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load reports');
        
        const data = await response.json();
        displayReports(data.reports);
        displayPagination('reports', data.pagination);
    } catch (error) {
        console.error('Error loading reports:', error);
        document.getElementById('reportsTableBody').innerHTML = 
            '<tr><td colspan="7" class="error-message">Failed to load reports</td></tr>';
    }
}

// Display reports
function displayReports(reports) {
    const tbody = document.getElementById('reportsTableBody');
    
    if (!reports || reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7">No reports found</td></tr>';
        return;
    }
    
    tbody.innerHTML = reports.map(report => {
        let targetLink = report.targetId;
        if (report.targetType === 'issue') {
            targetLink = `<a href="/issue/${report.targetId}?admin=true" target="_blank">${report.targetId}</a>`;
        } else if (report.targetType === 'user') {
            targetLink = `<a href="/admin#users" onclick="document.getElementById('userSearch').value='${report.targetId}'; loadUsers(1); return false;">${report.targetId}</a>`;
        }

        return `
            <tr>
                <td>${targetLink}</td>
                <td><span class="badge">${report.targetType}</span></td>
                <td>${report.reporterId?.username || 'Unknown'}</td>
                <td>${report.reason}</td>
                <td><span class="badge badge-${getStatusColor(report.status)}">${capitalize(report.status)}</span></td>
                <td>${new Date(report.createdAt).toLocaleDateString()}</td>
                <td class="actions">
                    <button class="btn-action btn-primary" onclick="updateReport('${report._id}', 'reviewed')">Review</button>
                    <button class="btn-action btn-success" onclick="updateReport('${report._id}', 'resolved')">Resolve</button>
                    <button class="btn-action btn-danger" onclick="updateReport('${report._id}', 'dismissed')">Dismiss</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Update report
async function updateReport(reportId, status) {
    try {
        const actionTaken = prompt('Enter action taken (optional):');
        const response = await fetch(`${API_URL}/admin/reports/${reportId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ status, actionTaken })
        });
        
        if (!response.ok) throw new Error('Failed to update report');
        
        alert('Report updated successfully');
        loadReports();
    } catch (error) {
        console.error('Error updating report:', error);
        alert('Failed to update report');
    }
}

// Load announcements
async function loadAnnouncements(page = 1) {
    try {
        const response = await fetch(`${API_URL}/admin/announcements?page=${page}&limit=20`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to load announcements');
        
        const data = await response.json();
        displayAnnouncements(data.announcements);
        displayPagination('announcements', data.pagination);
    } catch (error) {
        console.error('Error loading announcements:', error);
        document.getElementById('announcementsTableBody').innerHTML = 
            '<tr><td colspan="6" class="error-message">Failed to load announcements</td></tr>';
    }
}

// Display announcements
function displayAnnouncements(announcements) {
    const tbody = document.getElementById('announcementsTableBody');
    
    if (!announcements || announcements.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">No announcements found</td></tr>';
        return;
    }
    
    tbody.innerHTML = announcements.map(ann => `
        <tr>
            <td><strong>${ann.title}</strong></td>
            <td><span class="badge badge-${ann.type}">${ann.type}</span></td>
            <td>${ann.targetAudience} ${ann.targetDistrict ? `(${ann.targetDistrict})` : ''}</td>
            <td>${ann.createdBy?.username || 'Admin'}</td>
            <td>${new Date(ann.createdAt).toLocaleDateString()}</td>
            <td class="actions">
                <button class="btn-action btn-danger" onclick="deleteAnnouncement('${ann._id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

// Create announcement
async function createAnnouncement(e) {
    e.preventDefault();
    
    const announcementData = {
        title: document.getElementById('annTitle').value,
        content: document.getElementById('annContent').value,
        type: document.getElementById('annType').value,
        targetAudience: document.getElementById('annTarget').value,
        targetState: document.getElementById('annState').value,
        targetDistrict: document.getElementById('annDistrict').value
    };
    
    try {
        const response = await fetch(`${API_URL}/admin/announcements`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(announcementData)
        });
        
        if (!response.ok) throw new Error('Failed to create announcement');
        
        alert('Announcement created successfully');
        closeAnnouncementModal();
        loadAnnouncements();
    } catch (error) {
        console.error('Error creating announcement:', error);
        alert('Failed to create announcement');
    }
}

// Delete announcement
async function deleteAnnouncement(id) {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/announcements/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to delete announcement');
        
        alert('Announcement deleted successfully');
        loadAnnouncements();
    } catch (error) {
        console.error('Error deleting announcement:', error);
        alert('Failed to delete announcement');
    }
}

// Modal controls
function showAnnouncementModal() {
    document.getElementById('announcementModal').style.display = 'block';
}

function closeAnnouncementModal() {
    document.getElementById('announcementModal').style.display = 'none';
}

// Display pagination
function displayPagination(type, pagination) {
    const container = document.getElementById(`${type}Pagination`);
    
    if (pagination.pages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<div class="pagination-controls">';
    
    if (pagination.page > 1) {
        html += `<button class="btn-pagination" onclick="load${capitalize(type)}(${pagination.page - 1})">Previous</button>`;
    }
    
    html += `<span class="pagination-info">Page ${pagination.page} of ${pagination.pages}</span>`;
    
    if (pagination.page < pagination.pages) {
        html += `<button class="btn-pagination" onclick="load${capitalize(type)}(${pagination.page + 1})">Next</button>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

// Ban user
async function banUser(userId) {
    if (!confirm('Are you sure you want to ban this user?')) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}/ban`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to ban user');
        }
        
        alert('User banned successfully');
        await loadStats();
        await reloadCurrentTab();
    } catch (error) {
        console.error('Error banning user:', error);
        alert(error.message);
    }
}

// Unban user
async function unbanUser(userId) {
    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}/unban`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to unban user');
        
        alert('User unbanned successfully');
        await loadStats();
        await reloadCurrentTab();
    } catch (error) {
        console.error('Error unbanning user:', error);
        alert('Failed to unban user');
    }
}

// Verify user
async function verifyUser(userId) {
    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}/verify`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to verify user');
        
        alert('Authority verified successfully');
        await loadStats();
        await reloadCurrentTab();
    } catch (error) {
        console.error('Error verifying user:', error);
        alert('Failed to verify authority');
    }
}

// Unverify user
async function unverifyUser(userId) {
    if (!confirm('Remove verification from this authority?')) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/users/${userId}/unverify`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to unverify user');
        
        alert('Authority verification removed');
        await reloadCurrentTab();
    } catch (error) {
        console.error('Error unverifying user:', error);
        alert('Failed to remove verification');
    }
}

// Delete issue
async function deleteIssue(issueId) {
    if (!confirm('Are you sure you want to delete this issue? This action cannot be undone.')) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/issues/${issueId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to delete issue');
        
        alert('Issue deleted successfully');
        await loadStats();
        await loadIssues(currentIssuesPage);
    } catch (error) {
        console.error('Error deleting issue:', error);
        alert('Failed to delete issue');
    }
}

// Feature issue
async function featureIssue(issueId) {
    try {
        const response = await fetch(`${API_URL}/admin/issues/${issueId}/feature`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to feature issue');
        
        alert('Issue featured successfully');
        await loadStats();
        await loadIssues(currentIssuesPage);
    } catch (error) {
        console.error('Error featuring issue:', error);
        alert('Failed to feature issue');
    }
}

// Unfeature issue
async function unfeatureIssue(issueId) {
    try {
        const response = await fetch(`${API_URL}/admin/issues/${issueId}/unfeature`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to unfeature issue');
        
        alert('Issue unfeatured successfully');
        await loadIssues(currentIssuesPage);
    } catch (error) {
        console.error('Error unfeaturing issue:', error);
        alert('Failed to unfeature issue');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const tab = e.target.dataset.tab;
            switchTab(tab);
        });
    });
    
    // Filters
    document.getElementById('userRoleFilter')?.addEventListener('change', () => {
        currentUsersPage = 1;
        loadUsers(1);
    });
    
    document.getElementById('userBannedFilter')?.addEventListener('change', () => {
        currentUsersPage = 1;
        loadUsers(1);
    });
    
    document.getElementById('issueStatusFilter')?.addEventListener('change', () => {
        currentIssuesPage = 1;
        loadIssues(1);
    });

    document.getElementById('issueFeaturedFilter')?.addEventListener('change', () => {
        currentIssuesPage = 1;
        loadIssues(1);
    });

    document.getElementById('authorityVerifiedFilter')?.addEventListener('change', () => {
        currentAuthoritiesPage = 1;
        loadAuthorities(1);
    });

    document.getElementById('reportStatusFilter')?.addEventListener('change', () => {
        loadReports(1);
    });

    document.getElementById('reportTypeFilter')?.addEventListener('change', () => {
        loadReports(1);
    });

    // Add Enter key support for all search inputs
    const searchInputs = [
        { id: 'userSearch', func: loadUsers },
        { id: 'userDistrictSearch', func: loadUsers },
        { id: 'issueSearch', func: loadIssues },
        { id: 'issueDistrictSearch', func: loadIssues },
        { id: 'authoritySearch', func: loadAuthorities },
        { id: 'authorityDistrictSearch', func: loadAuthorities },
        { id: 'reportSearch', func: loadReports }
    ];

    searchInputs.forEach(({ id, func }) => {
        document.getElementById(id)?.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                func(1);
            }
        });
    });

    document.getElementById('announcementForm')?.addEventListener('submit', createAnnouncement);

    // Sidebar quick tab switching for new admin layout
    document.querySelectorAll('[data-tab-target]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = link.dataset.tabTarget;
            if (!tab) return;

            switchTab(tab);

            document.querySelectorAll('[data-tab-target]').forEach(item => item.classList.remove('active'));
            link.classList.add('active');
        });
    });
}

// Reload current active tab
async function reloadCurrentTab() {
    const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
    if (activeTab) switchTab(activeTab);
}

// Switch dashboard tabs
async function switchTab(tab) {
    // Update UI
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tab}Tab`);
    });

    // Keep sidebar and tab pills in sync
    document.querySelectorAll('[data-tab-target]').forEach(item => {
        item.classList.toggle('active', item.dataset.tabTarget === tab);
    });
    
    // Load data for tab
    switch(tab) {
        case 'users':
            await loadUsers(currentUsersPage);
            break;
        case 'issues':
            await loadIssues(currentIssuesPage);
            break;
        case 'authorities':
            await loadAuthorities(currentAuthoritiesPage);
            break;
        case 'moderation':
            await loadModeration(currentModerationPage);
            break;
        case 'flagged':
            await loadBannedUsers(1);
            break;
        case 'reports':
            await loadReports(1);
            break;
        case 'announcements':
            await loadAnnouncements(1);
            break;
        case 'home':
            await loadStats();
            break;
    }
}

// Utility: format status text
function formatStatus(status) {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Utility: get status color class
function getStatusColor(status) {
    const colors = {
        pending: 'warning',
        accepted: 'primary',
        in_progress: 'info',
        resolved: 'success',
        denied: 'danger',
        reviewed: 'info',
        dismissed: 'secondary'
    };
    return colors[status] || 'secondary';
}

// Utility: capitalize first letter
function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// Moderation helper functions
function viewIssue(issueId) {
    window.open(`/issue.html?id=${issueId}`, '_blank');
}

async function deleteIssueFromModeration(issueId) {
    if (!confirm('Are you sure you want to delete this issue? This action cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/issues/${issueId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) throw new Error('Failed to delete issue');
        
        alert('Issue deleted successfully');
        await loadModeration(currentModerationPage);
        await loadStats();
    } catch (error) {
        console.error('Error deleting issue:', error);
        alert('Failed to delete issue');
    }
}

async function banIssueReporter(userId) {
    if (!userId) {
        alert('User ID not found');
        return;
    }
    
    if (!confirm('Are you sure you want to ban this user?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/admin/ban-user`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: userId })
        });
        
        if (!response.ok) throw new Error('Failed to ban user');
        
        alert('User banned successfully');
        await loadModeration(currentModerationPage);
        await loadStats();
    } catch (error) {
        console.error('Error banning user:', error);
        alert('Failed to ban user');
    }
}

// Global scope functions for HTML onclick
window.banUser = banUser;
window.unbanUser = unbanUser;
window.verifyUser = verifyUser;
window.unverifyUser = unverifyUser;
window.deleteIssue = deleteIssue;
window.featureIssue = featureIssue;
window.unfeatureIssue = unfeatureIssue;
window.loadUsers = loadUsers;
window.loadIssues = loadIssues;
window.loadAuthorities = loadAuthorities;
window.loadReports = loadReports;
window.loadAnnouncements = loadAnnouncements;
window.updateReport = updateReport;
window.deleteAnnouncement = deleteAnnouncement;
window.showAnnouncementModal = showAnnouncementModal;
window.closeAnnouncementModal = closeAnnouncementModal;
window.deleteIssueFromModeration = deleteIssueFromModeration;

// Initialize on load
document.addEventListener('DOMContentLoaded', initAdmin);
