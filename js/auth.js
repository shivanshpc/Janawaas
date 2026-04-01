// API Configuration - loaded from config.js
// const API_URL is now defined in config.js

// Safe localStorage wrappers to handle SecurityError when storage is blocked
const safeLocalStorage = {
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn('localStorage access denied:', e);
            return null;
        }
    },
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (e) {
            console.warn('localStorage access denied:', e);
            return false;
        }
    },
    removeItem(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.warn('localStorage access denied:', e);
            return false;
        }
    }
};

// Authentication Functions
async function login(email, password) {
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        // Store token and user data
        safeLocalStorage.setItem('token', data.token);
        safeLocalStorage.setItem('user', JSON.stringify(data.user));

        return data;
    } catch (error) {
        throw error;
    }
}

async function register(userData) {
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        // Store token and user data in localStorage
        safeLocalStorage.setItem('token', data.token);
        safeLocalStorage.setItem('user', JSON.stringify(data.user));

        return data;
    } catch (error) {
        throw error;
    }
}

function logout() {
    safeLocalStorage.removeItem('token');
    safeLocalStorage.removeItem('user');
    window.location.href = '/';
}

function getToken() {
    return safeLocalStorage.getItem('token');
}

function getUser() {
    const user = safeLocalStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

function isAuthenticated() {
    return !!getToken();
}

let userCache = null;

async function checkAuth() {
    if (userCache) {
        return userCache;
    }

    if (!isAuthenticated()) {
        return null;
    }

    try {
        const response = await fetch(`${API_URL}/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            logout();
            return null;
        }

        const data = await response.json();
        localStorage.setItem('user', JSON.stringify(data.user));
        
        // Show admin link if user is admin
        if (data.user.role === 'admin') {
            const adminLink = document.getElementById('adminLink');
            if (adminLink) adminLink.style.display = 'inline';
        }
        
        userCache = data.user;
        return data.user;
    } catch (error) {
        console.error('Auth check failed:', error);
        return null;
    }
}

// Update navigation based on auth status
async function updateNavigation() {
    const user = await checkAuth();
    
    const navLogin = document.getElementById('navLogin');
    const navLogout = document.getElementById('navLogout');
    const navIndia = document.getElementById('navIndia');
    const navFeed = document.getElementById('navFeed');
    const navProfile = document.getElementById('navProfile');
    const navLeaderboard = document.getElementById('navLeaderboard');
    const navVerify = document.getElementById('navVerify');
    const navAuthorities = document.getElementById('navAuthorities');
    const navNotifications = document.getElementById('navNotifications');

    if (user) {
        if (navLogin) navLogin.style.display = 'none';
        if (navLogout) navLogout.style.display = 'block';
        
        // Conditional navigation for Authorities
        if (user.role === 'authority') {
            const navIndiaElements = document.querySelectorAll('.sidebar-nav a[href="/india"]');
            const navFeedElements = document.querySelectorAll('.sidebar-nav a[href="/district"]');
            
            navIndiaElements.forEach(el => el.style.display = 'none');
            navFeedElements.forEach(el => el.style.display = 'none');
            
            // Add Issues link if not exists in each sidebar-nav found
            const sidebarNavs = document.querySelectorAll('.sidebar-nav');
            sidebarNavs.forEach(sidebarNav => {
                let navIssues = sidebarNav.querySelector('#navIssues');
                if (!navIssues) {
                    navIssues = document.createElement('a');
                    navIssues.id = 'navIssues';
                    navIssues.href = '/authority-dashboard';
                    navIssues.title = 'Issues Dashboard';
                    navIssues.innerHTML = `
                        <span class="nav-icon">📋</span>
                        <span>Issues</span>
                    `;
                    
                    // Add active class if on dashboard
                    if (window.location.pathname === '/authority-dashboard') {
                        navIssues.classList.add('active');
                    }

                    // Insert before Leaderboard or at the end
                    const leaderboard = sidebarNav.querySelector('a[href="/leaderboard"]');
                    if (leaderboard) {
                        sidebarNav.insertBefore(navIssues, leaderboard);
                    } else {
                        sidebarNav.appendChild(navIssues);
                    }
                } else {
                    navIssues.style.display = 'block';
                    if (window.location.pathname === '/authority-dashboard') {
                        navIssues.classList.add('active');
                    }
                }
            });
        } else {
            const navIndiaElements = document.querySelectorAll('.sidebar-nav a[href="/india"]');
            const navFeedElements = document.querySelectorAll('.sidebar-nav a[href="/district"]');
            const navIssuesElements = document.querySelectorAll('#navIssues');
            
            navIndiaElements.forEach(el => el.style.display = 'block');
            navFeedElements.forEach(el => el.style.display = 'block');
            navIssuesElements.forEach(el => el.style.display = 'none');
        }

        if (navNotifications) navNotifications.style.display = 'block';
        // Show Authorities tab for all authenticated users
        if (navAuthorities) navAuthorities.style.display = 'block';
        if (navProfile) {
            navProfile.style.display = 'block';
            // Update profile link to standalone URL format
            if (user.username) {
                navProfile.href = `/profile/${user.username}`;
            }
        }
        if (navLeaderboard) navLeaderboard.style.display = 'block';
        
        // Show verification prompt if not verified
        if (navVerify && !user.isAadhaarVerified && !user.isVerified) {
            navVerify.style.display = 'block';
        }
    } else {
        if (navLogin) navLogin.style.display = 'block';
        if (navLogout) navLogout.style.display = 'none';
        // Allow viewing India and District without authentication
        if (navIndia) navIndia.style.display = 'block';
        if (navFeed) navFeed.style.display = 'block';
        if (navAuthorities) navAuthorities.style.display = 'none';
        if (navNotifications) navNotifications.style.display = 'none';
        if (navProfile) navProfile.style.display = 'none';
        if (navLeaderboard) navLeaderboard.style.display = 'none';
        if (navVerify) navVerify.style.display = 'none';
    }
}

// Login Form Handler
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const errorDiv = document.getElementById('loginError');

        try {
            const loginData = await login(email, password);
            // Redirect based on user role
            if (loginData.user && loginData.user.role === 'admin') {
                window.location.href = '/admin';
            } else if (loginData.user && loginData.user.role === 'authority') {
                window.location.href = '/authority-dashboard';
            } else {
                window.location.href = '/district';
            }
        } catch (error) {
            errorDiv.textContent = error.message;
            errorDiv.classList.add('show');
        }
    });
}

// Register Form Handler
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const userData = {
            displayName: document.getElementById('registerDisplayName').value,
            username: document.getElementById('registerUsername').value,
            email: document.getElementById('registerEmail').value,
            password: document.getElementById('registerPassword').value,
            state: document.getElementById('registerState').value,
            district: document.getElementById('registerDistrict').value,
            pincode: document.getElementById('registerPincode').value,
            role: document.getElementById('registerRole').value
        };

        const errorDiv = document.getElementById('registerError');

        try {
            const registerData = await register(userData);
            // Redirect based on user role
            if (registerData.user && registerData.user.role === 'admin') {
                window.location.href = '/admin';
            } else if (registerData.user && registerData.user.role === 'authority') {
                window.location.href = '/authority-dashboard';
            } else {
                window.location.href = '/district';
            }
        } catch (error) {
            errorDiv.textContent = error.message;
            errorDiv.classList.add('show');
        }
    });
}

// Auth Tab Switching
const authTabs = document.querySelectorAll('.auth-tab');
if (authTabs.length > 0) {
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            
            // Update active tab
            authTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show corresponding form
            if (tabName === 'login') {
                document.getElementById('loginForm').style.display = 'block';
                document.getElementById('registerForm').style.display = 'none';
            } else {
                document.getElementById('loginForm').style.display = 'none';
                document.getElementById('registerForm').style.display = 'block';
            }
        });
    });
}

// Logout Handler
const logoutBtn = document.getElementById('navLogout');
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
    });
}

// Initialize navigation on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateNavigation);
} else {
    updateNavigation();
}

// ============================================
// Verification Helper Functions
// ============================================

// Handle verification-required errors from API
async function handleApiError(response) {
    const data = await response.json();
    
    if (data.requiresVerification) {
        showVerificationModal();
        return { handled: true, error: data.error };
    }
    
    return { handled: false, error: data.error };
}

// Show verification required modal
function showVerificationModal() {
    // Check if modal already exists
    if (document.getElementById('verificationModal')) {
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'verificationModal';
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
        animation: fadeIn 0.3s;
    `;

    modal.innerHTML = `
        <div style="
            background: white;
            padding: 40px;
            border-radius: 15px;
            max-width: 500px;
            text-align: center;
            animation: slideIn 0.3s;
        ">
            <h2 style="color: #ff6b35; margin-bottom: 15px; font-size: 28px;">
                🔐 Verification Required
            </h2>
            <p style="color: #666; margin-bottom: 25px; font-size: 16px; line-height: 1.6;">
                You must verify your identity to access this feature. 
                Verification helps ensure accountability and trust in our community.
            </p>
            <div style="display: flex; gap: 15px; justify-content: center;">
                <button onclick="window.location.href='/verify'" style="
                    padding: 14px 30px;
                    background: #ff6b35;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.3s;
                ">Verify Now</button>
                <button onclick="document.getElementById('verificationModal').remove()" style="
                    padding: 14px 30px;
                    background: white;
                    color: #ff6b35;
                    border: 2px solid #ff6b35;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                ">Cancel</button>
            </div>
        </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes slideIn {
            from { transform: translateY(-20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(modal);
}
