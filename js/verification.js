// verification.js - Handle verification-related functionality

// Safe token getter
function getToken() {
    try {
        return localStorage.getItem('token');
    } catch (e) {
        console.warn('localStorage access denied:', e);
        return null;
    }
}

// Check verification status and redirect if needed
async function checkVerificationStatus(requireVerification = false) {
    const token = getToken();
    if (!token) {
        return null;
    }

    try {
        const response = await fetch('/api/verification/status', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const isVerified = data.isAadhaarVerified || data.isVerified;

            if (requireVerification && !isVerified) {
                // Show verification required modal or redirect
                showVerificationRequiredModal();
                return false;
            }

            return isVerified;
        }
    } catch (error) {
        console.error('Error checking verification:', error);
    }

    return null;
}

// Show modal prompting user to verify
function showVerificationRequiredModal() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    modal.innerHTML = `
        <div style="
            background: white;
            padding: 30px;
            border-radius: 10px;
            max-width: 500px;
            text-align: center;
        ">
            <h2 style="color: #ff6b35; margin-bottom: 15px;">🔐 Verification Required</h2>
            <p style="color: #666; margin-bottom: 25px;">
                You must verify your identity to access this feature. 
                Verification helps ensure accountability and trust in our community.
            </p>
            <button onclick="window.location.href='/verify'" style="
                padding: 12px 30px;
                background: #ff6b35;
                color: white;
                border: none;
                border-radius: 5px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                margin-right: 10px;
            ">Verify Now</button>
            <button onclick="window.location.href='/district'" style="
                padding: 12px 30px;
                background: white;
                color: #ff6b35;
                border: 2px solid #ff6b35;
                border-radius: 5px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
            ">Cancel</button>
        </div>
    `;

    document.body.appendChild(modal);
}

// Add verified badge to user display
function addVerifiedBadge(element, isVerified) {
    if (isVerified) {
        const badge = document.createElement('span');
        badge.className = 'verified-badge';
        badge.innerHTML = '✓ Verified';
        badge.style.cssText = `
            display: inline-block;
            background: #4caf50;
            color: white;
            padding: 3px 10px;
            border-radius: 15px;
            font-size: 12px;
            margin-left: 8px;
            font-weight: 600;
        `;
        element.appendChild(badge);
    }
}

// Handle verification-required API errors
function handleVerificationError(error) {
    if (error.requiresVerification) {
        showVerificationRequiredModal();
        return true;
    }
    return false;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        checkVerificationStatus,
        showVerificationRequiredModal,
        addVerifiedBadge,
        handleVerificationError
    };
}
