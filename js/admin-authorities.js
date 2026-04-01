// Admin Authority Management Dashboard

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
    let allApplications = [];
    let currentFilter = 'all';

    // Load applications on page load
    loadApplications();

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderApplications();
        });
    });

    // Modal close button
    document.querySelector('.modal-close').addEventListener('click', closeModal);

    // Modal background click
    document.getElementById('applicationModal').addEventListener('click', (e) => {
        if (e.target.id === 'applicationModal') {
            closeModal();
        }
    });

    // Approve form submit
    document.getElementById('approveForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const applicationId = document.getElementById('modalApplicationId').value;
        await handleApprove(applicationId);
    });

    // Reject form submit
    document.getElementById('rejectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const applicationId = document.getElementById('modalApplicationId').value;
        const reason = document.getElementById('rejectionReason').value;
        await handleReject(applicationId, reason);
    });

    // Load applications from API
    async function loadApplications() {
        try {
            const response = await fetch('/api/admin/authority-applications', {
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                allApplications = data.applications || [];
                updateStatistics();
                renderApplications();
            } else {
                console.error('Failed to load applications');
            }
        } catch (error) {
            console.error('Error loading applications:', error);
        }
    }

    // Update statistics
    function updateStatistics() {
        const total = allApplications.length;
        const pending = allApplications.filter(app => app.status === 'pending').length;
        const approved = allApplications.filter(app => app.status === 'approved').length;
        const rejected = allApplications.filter(app => app.status === 'rejected').length;

        document.getElementById('statTotal').textContent = total;
        document.getElementById('statPending').textContent = pending;
        document.getElementById('statApproved').textContent = approved;
        document.getElementById('statRejected').textContent = rejected;
    }

    // Render applications based on current filter
    function renderApplications() {
        const container = document.getElementById('applicationsGrid');
        
        let filtered = allApplications;
        if (currentFilter !== 'all') {
            filtered = allApplications.filter(app => app.status === currentFilter);
        }

        if (filtered.length === 0) {
            container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999; padding: 40px;">No applications found</p>';
            return;
        }

        container.innerHTML = filtered.map(app => createApplicationCard(app)).join('');

        // Add event listeners to view buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const appId = btn.dataset.id;
                viewApplication(appId);
            });
        });
    }

    // Create application card HTML
    function createApplicationCard(app) {
        const statusClass = `status-${app.status}`;
        return `
            <div class="application-card">
                <div class="application-header">
                    <h3>${app.fullName}</h3>
                    <span class="status-badge ${statusClass}">${app.status}</span>
                </div>
                <div class="application-info">
                    <p><strong>Designation:</strong> ${app.designation}</p>
                    <p><strong>Department:</strong> ${app.department}</p>
                    <p><strong>Jurisdiction:</strong> ${app.jurisdictionDistrict}, ${app.jurisdictionState}</p>
                    <p><strong>Email:</strong> ${app.officialEmail}</p>
                    <p><strong>Applied:</strong> ${new Date(app.createdAt).toLocaleDateString()}</p>
                </div>
                <div class="application-actions">
                    <button class="view-btn" data-id="${app._id}">View Details</button>
                </div>
            </div>
        `;
    }

    // View application details in modal
    async function viewApplication(applicationId) {
        try {
            const response = await fetch(`/api/admin/authority-applications/${applicationId}`, {
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                showApplicationModal(data.application);
            }
        } catch (error) {
            console.error('Error loading application details:', error);
        }
    }

    // Show application modal
    function showApplicationModal(app) {
        document.getElementById('modalApplicationId').value = app._id;
        document.getElementById('modalFullName').textContent = app.fullName;
        document.getElementById('modalDesignation').textContent = app.designation;
        document.getElementById('modalDepartment').textContent = app.department;
        document.getElementById('modalJurisdiction').textContent = `${app.jurisdictionDistrict}, ${app.jurisdictionState}`;
        document.getElementById('modalEmail').textContent = app.officialEmail;
        document.getElementById('modalGovId').textContent = app.governmentIdNumber;
        document.getElementById('modalSubmitted').textContent = new Date(app.createdAt).toLocaleDateString();
        
        // Status badge
        const statusBadge = document.getElementById('modalStatus');
        statusBadge.textContent = app.status.toUpperCase();
        statusBadge.className = `status-badge status-${app.status}`;

        // Document link
        const docLink = document.getElementById('modalDocument');
        docLink.href = app.appointmentLetterUrl;

        // Show/hide action buttons based on status
        const actionsDiv = document.getElementById('modalActions');
        if (app.status === 'pending') {
            actionsDiv.style.display = 'flex';
            document.getElementById('rejectReason').style.display = 'none';
        } else {
            actionsDiv.style.display = 'none';
        }

        // Show rejection reason if rejected
        if (app.status === 'rejected' && app.rejectionReason) {
            document.getElementById('reviewDetails').innerHTML += `
                <p style="margin-top: 15px; padding: 10px; background: #ffebee; border-radius: 5px;">
                    <strong>Rejection Reason:</strong><br>
                    ${app.rejectionReason}
                </p>
            `;
        }

        // Show reviewed by information
        if (app.reviewedBy) {
            document.getElementById('reviewDetails').innerHTML = `
                <p><strong>Reviewed by:</strong> ${app.reviewedBy.name}</p>
                <p><strong>Reviewed on:</strong> ${new Date(app.reviewedAt).toLocaleDateString()}</p>
            `;
        } else {
            document.getElementById('reviewDetails').innerHTML = '<p><em>Not yet reviewed</em></p>';
        }

        // Show modal
        document.getElementById('applicationModal').style.display = 'flex';
    }

    // Close modal
    function closeModal() {
        document.getElementById('applicationModal').style.display = 'none';
        document.getElementById('rejectReason').style.display = 'none';
        document.getElementById('rejectionReasonText').value = '';
    }

    // Show reject reason input
    window.showRejectReason = function() {
        document.getElementById('rejectReason').style.display = 'block';
    };

    // Handle approve action
    async function handleApprove(applicationId) {
        if (!confirm('Are you sure you want to approve this application?')) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/authority-applications/${applicationId}/approve`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (response.ok) {
                alert('Application approved successfully!');
                closeModal();
                loadApplications();
            } else {
                alert(data.error || 'Failed to approve application');
            }
        } catch (error) {
            console.error('Error approving application:', error);
            alert('An error occurred while approving the application');
        }
    }

    // Handle reject action
    async function handleReject(applicationId, reason) {
        if (!reason.trim()) {
            alert('Please provide a rejection reason');
            return;
        }

        try {
            const response = await fetch(`/api/admin/authority-applications/${applicationId}/reject`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reason })
            });

            const data = await response.json();

            if (response.ok) {
                alert('Application rejected');
                closeModal();
                loadApplications();
            } else {
                alert(data.error || 'Failed to reject application');
            }
        } catch (error) {
            console.error('Error rejecting application:', error);
            alert('An error occurred while rejecting the application');
        }
    }
});
