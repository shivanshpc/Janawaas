// Authority Application Form Handler

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
    const form = document.getElementById('authorityApplicationForm');
    const fileInput = document.getElementById('appointmentLetter');
    const fileLabel = document.querySelector('.file-label');
    const dropZone = document.querySelector('.file-upload-area');
    const filePreview = document.getElementById('filePreview');
    const fileNameDisplay = document.getElementById('fileName');
    const removeFileBtn = document.getElementById('removeFile');
    const submitButton = document.getElementById('submitBtn');
    const statusSection = document.getElementById('statusSection');

    let selectedFile = null;

    // Check existing application status on load
    checkApplicationStatus();

    // File input change handler
    fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });

    // Drag and drop handlers
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#667eea';
        dropZone.style.background = '#f0f4ff';
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#ddd';
        dropZone.style.background = 'transparent';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#ddd';
        dropZone.style.background = 'transparent';
        
        const file = e.dataTransfer.files[0];
        handleFileSelect(file);
    });

    // Remove file button
    removeFileBtn.addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        filePreview.style.display = 'none';
        dropZone.style.display = 'block';
    });

    // Form submit handler
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Validate file
        if (!selectedFile) {
            alert('Please upload your appointment letter');
            return;
        }

        // Validate file size (10MB)
        if (selectedFile.size > 10 * 1024 * 1024) {
            alert('File size must be less than 10MB');
            return;
        }

        // Validate file type
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
        if (!allowedTypes.includes(selectedFile.type)) {
            alert('Please upload a PDF, JPG or PNG file');
            return;
        }

        // Create FormData
        const formData = new FormData();
        formData.append('fullName', document.getElementById('fullName').value);
        formData.append('designation', document.getElementById('designation').value);
        formData.append('department', document.getElementById('department').value);
        formData.append('jurisdictionDistrict', document.getElementById('jurisdictionDistrict').value);
        formData.append('jurisdictionState', document.getElementById('jurisdictionState').value);
        formData.append('officialEmail', document.getElementById('officialEmail').value);
        formData.append('governmentIdNumber', document.getElementById('governmentIdNumber').value);
        formData.append('appointmentLetter', selectedFile);

        // Disable submit button
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';

        try {
            const response = await fetch('/api/authority/apply', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                alert('Application submitted successfully! Your application will be reviewed by our admin team.');
                form.reset();
                selectedFile = null;
                filePreview.style.display = 'none';
                dropZone.style.display = 'block';
                checkApplicationStatus();
            } else {
                alert(data.error || 'Failed to submit application');
            }
        } catch (error) {
            console.error('Error submitting application:', error);
            alert('An error occurred while submitting your application');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit Application';
        }
    });

    // Helper functions
    function handleFileSelect(file) {
        if (!file) return;

        // Validate file type
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
        if (!allowedTypes.includes(file.type)) {
            alert('Please upload a PDF, JPG or PNG file');
            return;
        }

        // Validate file size
        if (file.size > 10 * 1024 * 1024) {
            alert('File size must be less than 10MB');
            return;
        }

        selectedFile = file;
        fileNameDisplay.textContent = file.name;
        
        // Show preview
        dropZone.style.display = 'none';
        filePreview.style.display = 'block';
    }

    async function checkApplicationStatus() {
        try {
            const response = await fetch('/api/authority/status', {
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });

            const data = await response.json();

            if (response.ok && data.application) {
                displayApplicationStatus(data.application);
            }
        } catch (error) {
            console.error('Error checking application status:', error);
        }
    }

    function displayApplicationStatus(application) {
        const statusCard = document.getElementById('statusCard');
        const statusBadge = document.getElementById('statusBadge');
        const statusText = document.getElementById('statusText');
        const applicationInfo = document.getElementById('applicationInfo');
        const rejectionReasonDiv = document.getElementById('rejectionReason');

        // Show status section
        statusSection.style.display = 'block';

        // Set status badge
        statusBadge.textContent = application.status.toUpperCase();
        statusBadge.className = `status-badge status-${application.status}`;

        // Set status text
        const statusMessages = {
            pending: 'Your application is under review by the admin team.',
            approved: 'Congratulations! Your application has been approved. You now have authority access.',
            rejected: 'Your application has been rejected.'
        };
        statusText.textContent = statusMessages[application.status];

        // Show application info
        applicationInfo.innerHTML = `
            <p><strong>Name:</strong> ${application.fullName}</p>
            <p><strong>Designation:</strong> ${application.designation}</p>
            <p><strong>Department:</strong> ${application.department}</p>
            <p><strong>Jurisdiction:</strong> ${application.jurisdictionDistrict}, ${application.jurisdictionState}</p>
            <p><strong>Official Email:</strong> ${application.officialEmail}</p>
            <p><strong>Submitted:</strong> ${new Date(application.createdAt).toLocaleDateString()}</p>
        `;

        // Show rejection reason if applicable
        if (application.status === 'rejected' && application.rejectionReason) {
            rejectionReasonDiv.innerHTML = `
                <strong>Rejection Reason:</strong>
                <p>${application.rejectionReason}</p>
            `;
            rejectionReasonDiv.style.display = 'block';
        }

        // Hide form if pending or approved
        if (application.status === 'pending' || application.status === 'approved') {
            form.style.display = 'none';
        }
    }
});
