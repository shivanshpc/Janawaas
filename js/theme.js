/**
 * Dark Mode Theme Toggle
 * Handles theme switching and persistence
 */

// Initialize theme on page load
function initTheme() {
    // Check for saved theme preference or default to light mode
    let savedTheme = 'light';
    try {
        savedTheme = localStorage.getItem('theme') || 'light';
    } catch (e) {
        console.warn('localStorage access denied:', e);
    }
    
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark-mode');
        document.body.classList.add('dark-mode');
    } else {
        document.documentElement.classList.remove('dark-mode');
        document.body.classList.remove('dark-mode');
    }
    
    // Update button appearance
    updateThemeButton();
    
    // Setup theme toggle button
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
}

// Toggle between light and dark mode
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    
    // Save preference
    const isDarkMode = document.body.classList.contains('dark-mode');
    document.documentElement.classList.toggle('dark-mode', isDarkMode);
    try {
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    } catch (e) {
        console.warn('localStorage access denied:', e);
    }
    
    // Update button text and icon
    updateThemeButton();
    
    // Optional: Trigger any theme-dependent updates
    updateThemeDependent();
}

// Update theme button appearance
function updateThemeButton() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    
    const isDarkMode = document.body.classList.contains('dark-mode');
    const icon = themeToggle.querySelector('.theme-icon');
    const textSpan = themeToggle.querySelector('span:not(.theme-icon)');
    
    if (icon) {
        icon.textContent = isDarkMode ? '☀️' : '🌙';
    }
    
    if (textSpan) {
        textSpan.textContent = isDarkMode ? 'Light Mode' : 'Dark Mode';
    }
}

// Update any theme-dependent elements
function updateThemeDependent() {
    // Update any elements that need special handling in dark mode
    // For example, charts, maps, or other dynamic content
    const charts = document.querySelectorAll('.chart, .map');
    charts.forEach(chart => {
        if (document.body.classList.contains('dark-mode')) {
            chart.classList.add('dark-themed');
        } else {
            chart.classList.remove('dark-themed');
        }
    });
}

// Initialize theme when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTheme);
} else {
    initTheme();
}

// Export for use in other scripts if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initTheme, toggleTheme };
}
