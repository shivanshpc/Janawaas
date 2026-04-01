// Feed page logic
// API_URL is defined in auth.js
let currentUser = null;
let allIssues = [];
let mainMap = null;
let mapMarkers = [];
let miniMapMarker = null;
let miniMap = null;
let currentPage = 1;
let isLoading = false;
let hasMore = true;
const PAGE_SIZE = 15;  // Reduced from 10 for faster initial load
let heatmapActive = false;
let clusteringEnabled = true;
let composerPinnedLocation = null;

// Initialize feed page
async function initFeed() {
    currentUser = await checkAuth();
    
    // Redirect authorities away from District Feed
    if (currentUser && currentUser.role === 'authority') {
        window.location.href = '/authority-dashboard';
        return;
    }
    
    // Allow viewing without authentication, but disable actions
    
    // Update navigation
    await updateNavigation();
    
    // Hide create issue button if not logged in
    const createBtn = document.getElementById('createIssueBtn');
    if (createBtn) {
        if (!currentUser) {
            createBtn.style.display = 'none';
        }
    }

    // Show/hide inline composer (tweet-like) based on auth/verification
    const composer = document.getElementById('postComposer');
    if (composer) {
        if (!currentUser) {
            composer.style.display = 'none';
        } else {
            // Only show for verified users (same check as create button)
            if (!currentUser.isAadhaarVerified && !currentUser.isVerified) {
                composer.style.display = 'none';
            } else {
                composer.style.display = 'block';
                // personalize avatar initial
                try {
                    const avatar = composer.querySelector('.composer-avatar');
                    if (avatar && currentUser.displayName) {
                        avatar.textContent = currentUser.displayName.charAt(0).toUpperCase();
                    } else if (avatar && currentUser.name) {
                        avatar.textContent = currentUser.name.charAt(0).toUpperCase();
                    }
                } catch (e) {}
            }
        }
    }

    await Promise.all([
        loadIssues(),
        loadDistrictStats()
    ]);
    setupEventListeners();
}

// Load district statistics (cached for 30 seconds to avoid repeated calls)
let districtStatsCache = null;
let districtStatsCacheTime = 0;
async function loadDistrictStats() {
    // Only load stats if we have a district to query
    if (!currentUser || !currentUser.district) return;
    
    // Return cached stats if still valid (within 30 seconds)
    const now = Date.now();
    if (districtStatsCache && (now - districtStatsCacheTime) < 30000) {
        return districtStatsCache;
    }
    
    try {
        const res = await fetch(`${API_URL}/district/stats?district=${encodeURIComponent(currentUser.district)}`);
        if (!res.ok) return;
        const data = await res.json();
        
        // Cache the stats
        districtStatsCache = data;
        districtStatsCacheTime = now;
        const s = data.stats;
        
        // Update stats in sidebar if elements exist
        const statTotal = document.getElementById('statTotal');
        const statResolved = document.getElementById('statResolved');
        const statInProgress = document.getElementById('statInProgress');
        const statPending = document.getElementById('statPending');
        
        if (statTotal && s.totalIssues !== undefined) {
            statTotal.textContent = s.totalIssues.toLocaleString();
        }
        if (statResolved && s.totalResolvedIssues !== undefined) {
            statResolved.textContent = s.totalResolvedIssues.toLocaleString();
        }
        if (statInProgress && s.issuesInProgress !== undefined) {
            statInProgress.textContent = s.issuesInProgress.toLocaleString();
        }
        if (statPending && s.pendingIssues !== undefined) {
            statPending.textContent = s.pendingIssues.toLocaleString();
        }
    } catch (e) {
        console.error('Error loading district stats:', e);
    }
}

// Load issues from API
async function loadIssues(append = false) {
    if (isLoading) return;
    isLoading = true;

    const status = document.getElementById('filterStatus').value;
    const category = document.getElementById('filterCategory').value;
    const sort = document.getElementById('sortBy').value;
    const verifiedOnly = document.getElementById('filterVerified')?.value === 'verified';
    const searchQuery = document.getElementById('searchInput')?.value || '';

    const params = new URLSearchParams();
    if (currentUser && currentUser.district) params.append('district', currentUser.district);
    if (status) params.append('status', status);
    if (category) params.append('category', category);
    if (verifiedOnly) params.append('verifiedOnly', 'true');
    if (searchQuery) params.append('q', searchQuery);
    
    // Map frontend sort values to backend values
    if (sort === 'newest') params.append('sort', 'newest');
    else if (sort === 'severity') params.append('sort', 'severity');
    else if (sort === 'upvotes') params.append('sort', 'upvotes');
    else if (sort === 'oldest') params.append('sort', 'oldest');
    
    params.append('page', currentPage);
    // For first page, use smaller limit for faster initial load
    const pageLimit = append ? PAGE_SIZE : 10;
    params.append('limit', pageLimit);

    // Show loading indicator
    if (!append) {
        document.getElementById('issuesFeed').innerHTML = '<div class="loading">Loading issues...</div>';
    } else {
        showLoadingIndicator();
    }

    try {
        // Include auth header only if user is logged in
        const headers = {};
        if (getToken()) {
            headers['Authorization'] = `Bearer ${getToken()}`;
        }
        
        const response = await fetch(`${API_URL}/issues?${params}`, {
            headers: headers
        });

        if (!response.ok) throw new Error('Failed to load issues');

        const data = await response.json();
        
        if (append) {
            allIssues = [...allIssues, ...data.issues];
        } else {
            allIssues = data.issues;
        }
        
        hasMore = data.issues.length === PAGE_SIZE;
        displayIssues(allIssues);
        hideLoadingIndicator();
    } catch (error) {
        console.error('Error loading issues:', error);
        document.getElementById('issuesFeed').innerHTML = 
            '<p class="error-message show">Failed to load issues. Please try again.</p>';
    } finally {
        isLoading = false;
    }
}

// Display issues in feed
function displayIssues(issues) {
    const feed = document.getElementById('issuesFeed');

    if (issues.length === 0) {
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
    if (!hasMore && allIssues.length > 0) {
        feed.innerHTML += '<div class="end-of-feed">You\'ve reached the end of the feed</div>';
    }
}

// Setup event listeners
function setupEventListeners() {
    // Filters - reset pagination when filters change
    document.getElementById('filterStatus').addEventListener('change', () => {
        currentPage = 1;
        hasMore = true;
        loadIssues(false);
    });
    document.getElementById('filterCategory').addEventListener('change', () => {
        currentPage = 1;
        hasMore = true;
        loadIssues(false);
    });
    document.getElementById('sortBy').addEventListener('change', () => {
        currentPage = 1;
        hasMore = true;
        loadIssues(false);
    });

    // Verified filter
    const verifiedFilter = document.getElementById('filterVerified');
    if (verifiedFilter) {
        verifiedFilter.addEventListener('change', () => {
            currentPage = 1;
            hasMore = true;
            loadIssues(false);
        });
    }

    // Search input with debounce
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                currentPage = 1;
                hasMore = true;
                loadIssues(false);
            }, 500);
        });
    }

    // Issue feed action buttons (event delegation)
    const feed = document.getElementById('issuesFeed');
    if (feed) {
        feed.addEventListener('click', (e) => {
            const button = e.target.closest('.issue-action-btn');
            if (!button) return;
            
            e.stopPropagation();
            
            // Find the parent issue card
            const issueCard = button.closest('.issue-card');
            if (!issueCard) return;
            
            const action = button.dataset.action;
            const issueId = button.dataset.issueId;
            
            if (!issueId) return;
            
            if (action === 'comment') {
                window.location.href = `/issue/${issueId}#comments`;
            } else if (action === 'upvote') {
                handleUpvote(issueId, button);
            } else if (action === 'share') {
                handleShare(issueId, issueCard);
            }
        });
    }

    // Infinite scroll
    window.addEventListener('scroll', handleInfiniteScroll);

    // Create issue modal
    const modal = document.getElementById('createIssueModal');
    const createBtn = document.getElementById('createIssueBtn');
    
    if (createBtn && modal) {
        const closeBtn = modal.querySelector('.close');

        createBtn.addEventListener('click', async () => {
            // Check if user is logged in
            if (!currentUser) {
                window.location.href = '/login';
                return;
            }
            
            // Check if user is verified
            if (!currentUser.isAadhaarVerified && !currentUser.isVerified) {
                if (typeof showVerificationRequiredModal === 'function') {
                    showVerificationRequiredModal();
                } else {
                    alert('You must verify your identity to report issues. Please visit the verification page.');
                    window.location.href = '/verify';
                }
                return;
            }
            
            modal.classList.add('show');
            initMiniMap();
        });

        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
        });

        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
            }
        });
    }

    // Composer interactions (inline post)
    const composer = document.getElementById('postComposer');
    if (composer) {
        const composerTextarea = document.getElementById('composerTextarea');
        const composerPostBtn = document.getElementById('composerPostBtn');
        const composerImageBtn = document.getElementById('composerImageBtn');
        const composerLocationBtn = document.getElementById('composerLocationBtn');
        const composerCategory = document.getElementById('composerCategory');
        const composerMetaRow = document.getElementById('composerMetaRow');

        // clicking the composer area focuses the textarea (or opens modal if needed)
        composer.addEventListener('click', (e) => {
            // avoid double-handling if clicking the buttons inside
            if (e.target === composer || e.target === composerTextarea) {
                composerTextarea.focus();
            }
        });

        // Image button should open the file picker in the create modal
        composerImageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            // forward to modal file input
            const fileInput = document.getElementById('issueImages');
            if (fileInput) fileInput.click();
        });

        // Location pin toggles quick geolocation for composer only.
        composerLocationBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!currentUser) { window.location.href = '/login'; return; }

            if (composerPinnedLocation) {
                composerPinnedLocation = null;
                composerLocationBtn.classList.remove('location-active');
                composerLocationBtn.title = 'Add location';
                if (composerMetaRow) composerMetaRow.innerHTML = '';
                return;
            }

            composerLocationBtn.disabled = true;
            const previousLabel = composerLocationBtn.textContent;
            composerLocationBtn.textContent = '⏳';

            try {
                const location = await getCurrentLocation();
                let address = '';
                try {
                    address = await reverseGeocode(location.lat, location.lng);
                } catch (geoError) {
                    console.warn('Reverse geocode failed for composer pin:', geoError);
                }

                composerPinnedLocation = {
                    lat: location.lat,
                    lng: location.lng,
                    address: address || 'Location selected'
                };

                composerLocationBtn.classList.add('location-active');
                composerLocationBtn.title = 'Remove pinned location';
                if (composerMetaRow) {
                    composerMetaRow.innerHTML = `<span class="composer-location-pill">📍 ${composerPinnedLocation.address}</span>`;
                }
            } catch (error) {
                alert('Could not get your location: ' + error.message);
            } finally {
                composerLocationBtn.disabled = false;
                composerLocationBtn.textContent = previousLabel;
            }
        });

        // Post button: prefill create form and open modal so user can set location/images
        composerPostBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!currentUser) { window.location.href = '/login'; return; }
            if (!modal) return;

            const text = (composerTextarea.value || '').trim();
            const category = composerCategory.value || '';

            // Prefill title/description
            if (text) {
                const title = text.length > 120 ? text.substring(0, 120) : text;
                document.getElementById('issueTitle').value = title;
                document.getElementById('issueDescription').value = text;
            }
            if (category) {
                document.getElementById('issueCategory').value = category;
            }

            if (composerPinnedLocation) {
                document.getElementById('issueLat').value = composerPinnedLocation.lat;
                document.getElementById('issueLng').value = composerPinnedLocation.lng;
                if (composerPinnedLocation.address) {
                    document.getElementById('issueAddress').value = composerPinnedLocation.address;
                }
            }

            // Open modal and init map so user can complete location/images
            modal.classList.add('show');
            initMiniMap();

            if (composerPinnedLocation) {
                setTimeout(() => {
                    if (miniMap) {
                        updateMiniMapLocation(composerPinnedLocation.lat, composerPinnedLocation.lng);
                    }
                }, 350);
            }
        });
    }

    // Create issue form
    document.getElementById('createIssueForm').addEventListener('submit', handleCreateIssue);

    // Image preview
    document.getElementById('issueImages')?.addEventListener('change', handleImagePreview);

    // Get current location button
    document.getElementById('getCurrentLocation')?.addEventListener('click', async () => {
        try {
            const location = await getCurrentLocation();
            updateMiniMapLocation(location.lat, location.lng);
            
            const address = await reverseGeocode(location.lat, location.lng);
            document.getElementById('issueAddress').value = address;
        } catch (error) {
            alert('Could not get your location: ' + error.message);
        }
    });

    // Map toggle
    document.getElementById('toggleMapBtn').addEventListener('click', toggleMap);
    
    // Nearby issues button
    const nearbyBtn = document.getElementById('nearbyIssuesBtn');
    if (nearbyBtn) {
        nearbyBtn.addEventListener('click', async () => {
            if (!mainMap) {
                alert('Please show the map first');
                return;
            }
            
            nearbyBtn.disabled = true;
            nearbyBtn.textContent = '🔄 Finding...';
            
            try {
                const result = await showNearbyIssues(mainMap, 10);
                alert(`Found ${result.count} issues within 10km of your location`);
            } catch (error) {
                alert('Error: ' + error.message);
            } finally {
                nearbyBtn.disabled = false;
                nearbyBtn.textContent = '📍 Issues Near Me';
            }
        });
    }
    
    // Toggle heatmap button
    const heatmapBtn = document.getElementById('toggleHeatmapBtn');
    if (heatmapBtn) {
        heatmapBtn.addEventListener('click', () => {
            if (!mainMap) {
                alert('Please show the map first');
                return;
            }
            
            heatmapActive = !heatmapActive;
            
            if (heatmapActive) {
                // Hide markers and show heatmap
                mapMarkers.forEach(marker => marker.remove());
                if (typeof mapClusterMarkers !== 'undefined') {
                    mapClusterMarkers.forEach(marker => marker.remove());
                }
                addHeatmapLayer(mainMap, allIssues);
                heatmapBtn.textContent = '🔥 Heatmap: ON';
                heatmapBtn.dataset.active = 'true';
            } else {
                // Show markers and hide heatmap
                removeHeatmapLayer(mainMap);
                displayIssuesOnMap(mainMap, allIssues, clusteringEnabled);
                heatmapBtn.textContent = '🔥 Heatmap';
                heatmapBtn.dataset.active = 'false';
            }
        });
    }
    
    // Toggle clustering button
    const clusteringBtn = document.getElementById('toggleClusteringBtn');
    if (clusteringBtn) {
        clusteringBtn.addEventListener('click', () => {
            if (!mainMap) {
                alert('Please show the map first');
                return;
            }
            
            if (heatmapActive) {
                alert('Please disable heatmap first');
                return;
            }
            
            clusteringEnabled = !clusteringEnabled;
            
            // Redisplay markers with new clustering setting
            displayIssuesOnMap(mainMap, allIssues, clusteringEnabled);
            
            if (clusteringEnabled) {
                clusteringBtn.textContent = '🎯 Clustering: ON';
                clusteringBtn.dataset.active = 'true';
            } else {
                clusteringBtn.textContent = '🎯 Clustering: OFF';
                clusteringBtn.dataset.active = 'false';
            }
        });
    }
}

// Initialize mini map in create issue modal
function initMiniMap() {
    if (miniMap) return;

    const defaultLat = 12.9716;
    const defaultLng = 77.5946;

    setTimeout(() => {
        miniMap = initMap('miniMap', [defaultLng, defaultLat], 10);
        
        miniMap.on('click', (e) => {
            const { lng, lat } = e.lngLat;
            updateMiniMapLocation(lat, lng);
            
            reverseGeocode(lat, lng).then(address => {
                document.getElementById('issueAddress').value = address;
            });
        });

        // Add default marker
        miniMapMarker = addMarker(miniMap, [defaultLng, defaultLat], { draggable: true });
        
        miniMapMarker.on('dragend', () => {
            const { lng, lat } = miniMapMarker.getLngLat();
            document.getElementById('issueLat').value = lat;
            document.getElementById('issueLng').value = lng;
            
            reverseGeocode(lat, lng).then(address => {
                document.getElementById('issueAddress').value = address;
            });
        });

        document.getElementById('issueLat').value = defaultLat;
        document.getElementById('issueLng').value = defaultLng;
    }, 300);
}

function updateMiniMapLocation(lat, lng) {
    document.getElementById('issueLat').value = lat;
    document.getElementById('issueLng').value = lng;
    
    if (miniMapMarker) {
        miniMapMarker.setLngLat([lng, lat]);
    } else {
        miniMapMarker = addMarker(miniMap, [lng, lat], { draggable: true });
    }
    
    miniMap.flyTo({ center: [lng, lat], zoom: 14 });
}

// Handle image preview
function handleImagePreview(e) {
    const files = Array.from(e.target.files);
    const previewContainer = document.getElementById('imagePreview');
    previewContainer.innerHTML = '';

    if (files.length > 5) {
        alert('You can only upload up to 5 images');
        e.target.value = '';
        return;
    }

    files.forEach((file, index) => {
        if (file.size > 5 * 1024 * 1024) {
            alert(`Image ${index + 1} is too large. Maximum size is 5MB`);
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = document.createElement('img');
            img.src = event.target.result;
            img.style.width = '100px';
            img.style.height = '100px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '4px';
            previewContainer.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
}

// Upload images to Cloudinary
async function uploadImages(files) {
    const formData = new FormData();
    files.forEach(file => {
        formData.append('images', file);
    });

    const response = await fetch(`${API_URL}/issues/upload-images`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${getToken()}`
        },
        body: formData
    });

    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upload images');
    }

    const { images } = await response.json();
    return images;
}

// Handle create issue form submission
async function handleCreateIssue(e) {
    e.preventDefault();

    const errorDiv = document.getElementById('createIssueError');
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';

    try {
        // Upload images if any
        let images = [];
        const imageFiles = document.getElementById('issueImages')?.files;
        if (imageFiles && imageFiles.length > 0) {
            errorDiv.textContent = 'Uploading images...';
            errorDiv.classList.add('show');
            errorDiv.style.color = '#2196F3';
            
            images = await uploadImages(Array.from(imageFiles));
            
            errorDiv.classList.remove('show');
        }

        const issueData = {
            title: document.getElementById('issueTitle').value,
            description: document.getElementById('issueDescription').value,
            category: document.getElementById('issueCategory').value,
            district: document.getElementById('issueDistrict').value,
            state: document.getElementById('issueState').value,
            latitude: parseFloat(document.getElementById('issueLat').value),
            longitude: parseFloat(document.getElementById('issueLng').value),
            images: images
        };

        const response = await fetch(`${API_URL}/issues`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(issueData)
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to create issue');
        }

        const { issue } = await response.json();
        
        // Close modal and reset form
        document.getElementById('createIssueModal').classList.remove('show');
        document.getElementById('createIssueForm').reset();
        document.getElementById('imagePreview').innerHTML = '';
        
        // Redirect to issue page
        window.location.href = `/issue/${issue._id}`;
    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.style.color = '#f44336';
        errorDiv.classList.add('show');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Issue';
    }
}

// Toggle map view
function toggleMap() {
    const mapView = document.getElementById('mapView');
    const issuesFeed = document.getElementById('issuesFeed');
    const toggleBtn = document.getElementById('toggleMapBtn');

    if (mapView.style.display === 'none') {
        mapView.style.display = 'block';
        issuesFeed.style.display = 'none';
        toggleBtn.textContent = 'Show List';
        
        if (!mainMap) {
            mainMap = initMap('map');
        }
        
        // Clear old markers
        mapMarkers.forEach(marker => marker.remove());
        mapMarkers = [];
        
        // Add issue markers with clustering
        if (allIssues.length > 0) {
            mapMarkers = displayIssuesOnMap(mainMap, allIssues, clusteringEnabled);
            
            // Resize map to ensure proper rendering
            setTimeout(() => {
                mainMap.resize();
            }, 100);
        } else {
            // Center on default location if no issues
            mainMap.flyTo({ center: [77.5946, 12.9716], zoom: 12 });
        }
    } else {
        mapView.style.display = 'none';
        issuesFeed.style.display = 'grid';
        toggleBtn.textContent = 'Show Map';
    }
}

// Get time ago string
function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now - date;
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
    if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    if (diffDays < 7) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
    if (diffWeeks < 4) return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;
    if (diffMonths < 12) return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
    
    return date.toLocaleDateString();
}

// Utility function to format dates (for compatibility)
function formatDate(dateString) {
    return getTimeAgo(dateString);
}

// Format status for display
function formatStatus(status) {
    return status.replace(/_/g, ' ').replace(/-/g, ' ').toUpperCase();
}

// Get category icon
function getCategoryIcon(category) {
    const icons = {
        roads: '🛣️',
        garbage: '🗑️',
        electricity: '⚡',
        water: '💧',
        streetlight: '💡',
        drainage: '🚰',
        other: '📋'
    };
    return icons[category.toLowerCase()] || '📋';
}

// Show loading indicator
function showLoadingIndicator() {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
        indicator.innerHTML = '<div class="loading">Loading more issues...</div>';
        indicator.style.display = 'block';
    }
}

// Hide loading indicator
function hideLoadingIndicator() {
    const indicator = document.getElementById('loadingIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// Handle upvote action
async function handleUpvote(issueId, button) {
    if (!currentUser) {
        window.location.href = '/login';
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/issues/${issueId}/upvote`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to upvote');
        }

        const data = await response.json();
        
        // Update button text with new count
        button.textContent = `👍 ${data.upvoteCount} ${data.upvoteCount === 1 ? 'upvote' : 'upvotes'}`;
        
        // Visual feedback
        button.style.background = 'rgba(0, 255, 150, 0.1)';
        button.style.borderColor = '#00ff96';
        
        console.log('✅ Upvoted successfully');
    } catch (error) {
        console.error('❌ Upvote error:', error);
        alert(error.message || 'Failed to upvote. Please try again.');
    }
}

// Handle share action
function handleShare(issueId, issueCard) {
    const issueTitle = issueCard.querySelector('.issue-card-title a')?.textContent || 'Check out this issue';
    const issueCategory = issueCard.querySelector('.issue-category-badge')?.textContent.replace(/[^a-zA-Z]/g, '') || 'Issue';
    const issueLocation = issueCard.querySelector('.issue-card-meta span')?.textContent || 'Location';
    const issueDescription = issueCard.querySelector('.issue-description')?.textContent || '';
    const upvoteText = issueCard.querySelector('button[data-action="upvote"]')?.textContent || '0';
    const upvoteCount = upvoteText.match(/\d+/)?.[0] || '0';
    
    openShareModal({
        id: issueId,
        title: issueTitle,
        category: issueCategory,
        location: issueLocation,
        description: issueDescription,
        upvotes: upvoteCount
    });
}

function openShareModal(issueData) {
    const modal = document.getElementById('shareModal');
    if (!modal) return;
    
    const title = document.getElementById('previewTitle');
    const location = document.getElementById('previewLocation');
    const category = document.getElementById('previewCategory');
    const categoryIcon = document.getElementById('previewCategoryIcon');
    const upvotes = document.getElementById('previewUpvotes');
    const description = document.getElementById('previewDescription');
    const linkInput = document.getElementById('shareLinkInput');
    
    const issueUrl = `${window.location.origin}/issue/${issueData.id}`;
    
    title.textContent = issueData.title;
    location.textContent = issueData.location.replace('📍 ', '');
    category.textContent = issueData.category.toUpperCase();
    categoryIcon.textContent = getCategoryIcon(issueData.category);
    upvotes.textContent = issueData.upvotes;
    description.textContent = issueData.description;
    linkInput.value = issueUrl;
    
    // Setup social buttons for this specific issue
    const socialItems = modal.querySelectorAll('.social-item');
    socialItems.forEach(item => {
        // Remove old listeners to avoid duplicates
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        newItem.addEventListener('click', () => {
            const platform = newItem.dataset.platform;
            const shareText = `${issueData.title} - ${issueData.location}`;
            let shareUrl = '';
            
            switch (platform) {
                case 'twitter':
                    shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(issueUrl)}`;
                    break;
                case 'whatsapp':
                    shareUrl = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + issueUrl)}`;
                    break;
                case 'facebook':
                    shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(issueUrl)}`;
                    break;
                case 'linkedin':
                    shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(issueUrl)}`;
                    break;
            }
            if (shareUrl) window.open(shareUrl, '_blank', 'width=600,height=400');
        });
    });

    // Setup copy button
    const copyBtn = document.getElementById('copyLinkBtn');
    if (copyBtn) {
        copyBtn.onclick = () => {
            linkInput.select();
            navigator.clipboard.writeText(linkInput.value).then(() => {
                const originalText = copyBtn.textContent;
                copyBtn.textContent = 'Copied!';
                copyBtn.style.background = '#28a745';
                setTimeout(() => {
                    copyBtn.textContent = originalText;
                    copyBtn.style.background = '';
                }, 2000);
            });
        };
    }

    // Setup close button
    const closeBtn = document.getElementById('closeShareModal');
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }
    
    modal.style.display = 'flex';
}

function getCategoryIcon(category) {
    const icons = {
        roads: '🛣️',
        garbage: '🗑️',
        electricity: '⚡',
        water: '💧',
        streetlight: '💡',
        drainage: '🌊',
        other: '📋'
    };
    return icons[category?.toLowerCase()] || '📋';
}

// Handle infinite scroll
function handleInfiniteScroll() {
    if (isLoading || !hasMore) return;

    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.documentElement.scrollHeight - 500;

    if (scrollPosition >= threshold) {
        currentPage++;
        loadIssues(true);
    }
}

// Initialize on page load (only if this is the district feed page)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Only initialize if the required district feed elements exist
        if (document.getElementById('filterStatus') && document.getElementById('filterCategory')) {
            initFeed();
        }
    });
} else {
    // Only initialize if the required district feed elements exist
    if (document.getElementById('filterStatus') && document.getElementById('filterCategory')) {
        initFeed();
    }
}

// Real-time integration - join district room when feed loads
setTimeout(() => {
    // Real-time integration
    if (typeof realtimeManager !== 'undefined' && currentUser && currentUser.district) {
        realtimeManager.joinDistrict(currentUser.district);

        realtimeManager.onIssueUpvoted((data) => {
            const upvoteBtn = document.querySelector(`button[data-issue-id="${data.issueId}"][data-action="upvote"]`);
            if (upvoteBtn) {
                upvoteBtn.textContent = `👍 ${data.upvotes} ${data.upvotes === 1 ? 'upvote' : 'upvotes'}`;
            }
        });
    }
}, 1000);

// Function to add new issue to feed (called by realtime manager)
function updateFeedWithNewIssue(issue) {
    // Add the new issue to the top of the feed
    const issuesGrid = document.getElementById('issuesGrid');
    if (!issuesGrid) return;
    
    const issueCard = createIssueCard(issue);
    issuesGrid.insertAdjacentHTML('afterbegin', issueCard);
}
