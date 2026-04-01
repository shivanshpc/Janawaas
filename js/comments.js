// Comments functionality (namespaced to prevent global collisions)
// API_URL is defined in config.js / auth.js

window.CommentsAPI = (function() {
    async function loadCommentsForIssue(issueId) {
        try {
            const response = await fetch(`${API_URL}/comments/issue/${issueId}`);
            if (!response.ok) throw new Error('Failed to load comments');
            const data = await response.json();
            return data.comments;
        } catch (error) {
            console.error('Load comments error:', error);
            return [];
        }
    }

    async function addCommentForIssue(issueId, content, token) {
        try {
            const response = await fetch(`${API_URL}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    body: content,
                    issueId
                })
            });

            if (!response.ok) throw new Error('Failed to add comment');
            const data = await response.json();
            return data.comment;
        } catch (error) {
            console.error('Add comment error:', error);
            throw error;
        }
    }

    async function deleteCommentById(commentId, token) {
        try {
            const response = await fetch(`${API_URL}/comments/${commentId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) throw new Error('Failed to delete comment');
            return true;
        } catch (error) {
            console.error('Delete comment error:', error);
            throw error;
        }
    }

    function renderCommentsList(comments, container) {
        if (!comments || comments.length === 0) {
            container.innerHTML = '<p class="no-issues">No comments yet.</p>';
            return;
        }

        container.innerHTML = comments.map(comment => `
            <div class="comment ${comment.authorId?.role === 'authority' || comment.authorId?.role === 'admin' ? 'comment-official' : ''}">
                <div class="comment-header">
                    <span class="comment-author">
                        ${comment.authorId?.name || 'Anonymous'}
                        ${(comment.authorId?.role === 'authority' || comment.authorId?.role === 'admin') ? `<span class="badge">${comment.authorId.role}</span>` : ''}
                    </span>
                    <span class="comment-date">${formatCommentDate(comment.createdAt)}</span>
                </div>
                <p>${comment.body}</p>
            </div>
        `).join('');
    }

    function formatCommentDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffMinutes = Math.floor(diffTime / (1000 * 60));
        const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffMinutes < 1) return 'Just now';
        if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        return date.toLocaleDateString();
    }

    return {
        loadCommentsForIssue,
        addCommentForIssue,
        deleteCommentById,
        renderCommentsList,
        formatCommentDate
    };
})();
