// Real-time updates using Socket.IO
class RealtimeManager {
    constructor() {
        this.socket = null;
        this.currentDistrict = null;
        this.currentIssueId = null;
        this.isConnected = false;
    }

    // Initialize Socket.IO connection
    init() {
        // Connect to Socket.IO server (using SOCKET_URL from config.js)
        this.socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });

        // Connection event handlers
        this.socket.on('connect', () => {
            console.log('✅ Connected to real-time server');
            this.isConnected = true;
            
            // Join user's personal room for notifications
            let user = {};
            try {
                user = JSON.parse(localStorage.getItem('user') || '{}');
            } catch (e) {
                console.warn('localStorage access denied:', e);
            }
            if (user._id) {
                this.socket.emit('join_user', user._id);
            }
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from real-time server');
            this.isConnected = false;
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
        });

        // Set up event listeners
        this.setupEventListeners();
    }

    // Join district room
    joinDistrict(district) {
        if (!this.socket || !district) return;
        
        // Leave previous district if any
        if (this.currentDistrict) {
            this.socket.emit('leave_district', this.currentDistrict);
        }
        
        this.currentDistrict = district;
        this.socket.emit('join_district', district);
        console.log(`Joined district room: ${district}`);
    }

    // Join issue room
    joinIssue(issueId) {
        if (!this.socket || !issueId) return;
        
        // Leave previous issue if any
        if (this.currentIssueId) {
            this.socket.emit('leave_issue', this.currentIssueId);
        }
        
        this.currentIssueId = issueId;
        this.socket.emit('join_issue', issueId);
        console.log(`Joined issue room: ${issueId}`);
    }

    // Leave current rooms
    leaveRooms() {
        if (this.currentDistrict) {
            this.socket.emit('leave_district', this.currentDistrict);
            this.currentDistrict = null;
        }
        
        if (this.currentIssueId) {
            this.socket.emit('leave_issue', this.currentIssueId);
            this.currentIssueId = null;
        }
    }

    // Set up event listeners for real-time updates
    setupEventListeners() {
        // New issue created in district
        this.socket.on('issue_created', (data) => {
            console.log('New issue created:', data);
            this.handleIssueCreated(data);
        });

        // Issue upvoted
        this.socket.on('issue_upvoted', (data) => {
            console.log('Issue upvoted:', data);
            this.handleIssueUpvoted(data);
        });

        // Issue status updated
        this.socket.on('issue_status_updated', (data) => {
            console.log('Issue status updated:', data);
            this.handleIssueStatusUpdated(data);
        });

        // Comment added to issue
        this.socket.on('issue_comment_added', (data) => {
            console.log('Comment added:', data);
            this.handleCommentAdded(data);
        });

        // Update posted on issue
        this.socket.on('issue_update_posted', (data) => {
            console.log('Update posted:', data);
            this.handleUpdatePosted(data);
        });

        // Issue resolved
        this.socket.on('issue_resolved', (data) => {
            console.log('Issue resolved:', data);
            this.handleIssueResolved(data);
        });

        // Real-time notification
        this.socket.on('notification', (data) => {
            console.log('Notification received:', data);
            this.handleNotification(data);
        });
    }

    // Register a callback for upvotes
    onIssueUpvoted(callback) {
        this.upvoteCallback = callback;
    }

    // Handle new issue created
    handleIssueCreated(data) {
        const { issue, district } = data;
        
        // Show toast notification
        this.showToast(`New issue reported: ${issue.title}`, 'info');
        
        // If on district feed page, update feed
        if (typeof updateFeedWithNewIssue === 'function') {
            updateFeedWithNewIssue(issue);
        }
    }

    // Handle issue upvoted
    handleIssueUpvoted(data) {
        const { issueId, upvotes } = data;
        
        // Update upvote count in UI
        const upvoteElements = document.querySelectorAll(`[data-issue-id="${issueId}"] .upvote-count`);
        upvoteElements.forEach(el => {
            el.textContent = upvotes;
        });
        
        // Update on issue page if viewing
        const issueUpvoteBtnCount = document.querySelector('.upvote-btn .upvote-count');
        if (issueUpvoteBtnCount && this.currentIssueId === issueId) {
            issueUpvoteBtnCount.textContent = upvotes;
        }

        // Call registered callback if any
        if (typeof this.upvoteCallback === 'function') {
            this.upvoteCallback(data);
        }
    }

    // Handle issue status updated
    handleIssueStatusUpdated(data) {
        const { issueId, status, statusBy } = data;
        
        this.showToast(`Issue status changed to: ${status}`, 'success');
        
        // Update status badge in UI
        const statusBadge = document.querySelector(`[data-issue-id="${issueId}"] .status-badge`);
        if (statusBadge) {
            statusBadge.textContent = status;
            statusBadge.className = `status-badge status-${status.toLowerCase().replace(' ', '-')}`;
        }
        
        // Update on issue page if viewing
        if (this.currentIssueId === issueId) {
            const issueStatusBadge = document.querySelector('.issue-header .status-badge');
            if (issueStatusBadge) {
                issueStatusBadge.textContent = status;
                issueStatusBadge.className = `status-badge status-${status.toLowerCase().replace(' ', '-')}`;
            }
        }
    }

    // Handle comment added
    handleCommentAdded(data) {
        const { comment, issueId } = data;
        
        // Only update if viewing this issue
        if (this.currentIssueId === issueId) {
            this.showToast('New comment added', 'info');
            
            // Add comment to comments section
            if (typeof addCommentToUI === 'function') {
                addCommentToUI(comment);
            }
        }
    }

    // Handle update posted
    handleUpdatePosted(data) {
        const { update, issueId } = data;
        
        // Only update if viewing this issue
        if (this.currentIssueId === issueId) {
            this.showToast('New update posted on this issue', 'info');
            
            // Add update to timeline
            if (typeof addUpdateToTimeline === 'function') {
                addUpdateToTimeline(update);
            }
        }
    }

    // Handle issue resolved
    handleIssueResolved(data) {
        const { issueId, resolvedBy } = data;
        
        this.showToast('Issue marked as resolved! 🎉', 'success');
        
        // Update UI
        this.handleIssueStatusUpdated({ issueId, status: 'Resolved' });
    }

    // Handle notification
    handleNotification(data) {
        const { title, message, type } = data;
        
        this.showToast(message, type || 'info');
        
        // Update notification bell/badge if function exists
        if (typeof updateNotificationBadge === 'function') {
            updateNotificationBadge();
        }
    }

    // Show toast notification
    showToast(message, type = 'info') {
        // Create toast element
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${this.getToastIcon(type)}</span>
                <span class="toast-message">${message}</span>
            </div>
        `;
        
        // Add toast to container or create container
        let toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container';
            document.body.appendChild(toastContainer);
        }
        
        toastContainer.appendChild(toast);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.classList.add('toast-fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    // Get icon for toast type
    getToastIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }

    // Disconnect socket
    disconnect() {
        if (this.socket) {
            this.leaveRooms();
            this.socket.disconnect();
        }
    }
}

// Create global instance
const realtimeManager = new RealtimeManager();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Update navigation when page loads
    if (typeof updateNavigation === 'function') {
        updateNavigation();
    }
    realtimeManager.init();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = realtimeManager;
}
