// Map initialization and utilities
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// Global variables for map enhancements
let mapClusterMarkers = [];
let heatmapData = null;

function initMap(containerId, center = [77.5946, 12.9716], zoom = 12) {
    const map = new maplibregl.Map({
        container: containerId,
        style: MAP_STYLE,
        center: center,
        zoom: zoom
    });

    map.addControl(new maplibregl.NavigationControl());
    
    return map;
}

function addMarker(map, coordinates, options = {}) {
    const marker = new maplibregl.Marker(options)
        .setLngLat(coordinates)
        .addTo(map);
    
    return marker;
}

function addMarkerWithPopup(map, coordinates, popupContent) {
    const popup = new maplibregl.Popup({ offset: 25 })
        .setHTML(popupContent);

    const marker = new maplibregl.Marker()
        .setLngLat(coordinates)
        .setPopup(popup)
        .addTo(map);
    
    return marker;
}

function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser'));
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                });
            },
            (error) => {
                reject(error);
            }
        );
    });
}

async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
        );
        const data = await response.json();
        return data.display_name;
    } catch (error) {
        console.error('Reverse geocode error:', error);
        return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
}

// Issue map markers
function createIssueMarker(issue) {
    const el = document.createElement('div');
    el.className = 'custom-marker';
    el.style.width = '30px';
    el.style.height = '30px';
    el.style.borderRadius = '50%';
    el.style.cursor = 'pointer';
    
    // Color based on status
    const statusColors = {
        'pending': '#f59e0b',
        'accepted': '#3b82f6',
        'in-progress': '#8b5cf6',
        'in_progress': '#8b5cf6',
        'resolved': '#10b981',
        'rejected': '#ef4444',
        'denied': '#ef4444'
    };
    
    el.style.backgroundColor = statusColors[issue.status] || '#64748b';
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    
    return el;
}

// Create cluster marker
function createClusterMarker(count) {
    const el = document.createElement('div');
    el.className = 'cluster-marker';
    el.style.width = '40px';
    el.style.height = '40px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#2563eb';
    el.style.color = 'white';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.fontWeight = 'bold';
    el.style.fontSize = '14px';
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    el.style.cursor = 'pointer';
    el.textContent = count;
    
    // Scale based on count
    if (count > 10) {
        el.style.width = '50px';
        el.style.height = '50px';
        el.style.fontSize = '16px';
    }
    if (count > 50) {
        el.style.width = '60px';
        el.style.height = '60px';
        el.style.fontSize = '18px';
    }
    
    return el;
}

// Display issues on map with clustering
function displayIssuesOnMap(map, issues, enableClustering = true) {
    // Clear existing markers
    mapClusterMarkers.forEach(marker => marker.remove());
    mapClusterMarkers = [];
    
    if (!issues || issues.length === 0) {
        return [];
    }
    
    // Extract issue coordinates
    const issueFeatures = issues
        .filter(issue => {
            return (issue.latitude && issue.longitude) || 
                   (issue.location && issue.location.coordinates);
        })
        .map(issue => {
            let lat, lng;
            if (issue.location && issue.location.coordinates) {
                [lng, lat] = issue.location.coordinates;
            } else {
                lat = issue.latitude;
                lng = issue.longitude;
            }
            return {
                type: 'Feature',
                properties: { issue },
                geometry: {
                    type: 'Point',
                    coordinates: [lng, lat]
                }
            };
        });
    
    if (issueFeatures.length === 0) {
        return [];
    }
    
    // Setup clustering if enabled and Supercluster is available
    if (enableClustering && typeof Supercluster !== 'undefined' && issueFeatures.length > 5) {
        const cluster = new Supercluster({
            radius: 60,
            maxZoom: 16
        });
        
        cluster.load(issueFeatures);
        
        // Function to update clusters on map move/zoom
        function updateClusters() {
            const bounds = map.getBounds();
            const bbox = [
                bounds.getWest(),
                bounds.getSouth(),
                bounds.getEast(),
                bounds.getNorth()
            ];
            const zoom = Math.floor(map.getZoom());
            const clusters = cluster.getClusters(bbox, zoom);
            
            // Clear existing markers
            mapClusterMarkers.forEach(marker => marker.remove());
            mapClusterMarkers = [];
            
            // Add new markers
            clusters.forEach(cluster => {
                const [lng, lat] = cluster.geometry.coordinates;
                const { cluster: isCluster, point_count } = cluster.properties;
                
                let marker;
                
                if (isCluster) {
                    // Create cluster marker
                    const el = createClusterMarker(point_count);
                    el.addEventListener('click', () => {
                        const expansionZoom = Math.min(
                            cluster.getClusterExpansionZoom(cluster.id),
                            20
                        );
                        map.flyTo({
                            center: [lng, lat],
                            zoom: expansionZoom
                        });
                    });
                    
                    marker = new maplibregl.Marker({ element: el })
                        .setLngLat([lng, lat])
                        .addTo(map);
                } else {
                    // Create individual issue marker
                    const issue = cluster.properties.issue;
                    const popupContent = createIssuePopup(issue);
                    const markerEl = createIssueMarker(issue);
                    
                    markerEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        window.location.href = `/issue/${issue._id}`;
                    });
                    
                    marker = new maplibregl.Marker({ element: markerEl })
                        .setLngLat([lng, lat])
                        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(popupContent))
                        .addTo(map);
                }
                
                mapClusterMarkers.push(marker);
            });
        }
        
        // Update clusters on map events
        map.on('moveend', updateClusters);
        map.on('zoomend', updateClusters);
        
        // Initial cluster update
        updateClusters();
        
    } else {
        // No clustering - display all markers individually
        issueFeatures.forEach(feature => {
            const issue = feature.properties.issue;
            const [lng, lat] = feature.geometry.coordinates;
            
            const popupContent = createIssuePopup(issue);
            const markerEl = createIssueMarker(issue);
            
            markerEl.addEventListener('click', (e) => {
                e.stopPropagation();
                window.location.href = `/issue/${issue._id}`;
            });
            
            const marker = new maplibregl.Marker({ element: markerEl })
                .setLngLat([lng, lat])
                .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(popupContent))
                .addTo(map);
            
            mapClusterMarkers.push(marker);
        });
    }
    
    // Fit map to show all markers
    if (issueFeatures.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        issueFeatures.forEach(feature => {
            bounds.extend(feature.geometry.coordinates);
        });
        
        if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
        }
    }
    
    return mapClusterMarkers;
}

// Create issue popup content
function createIssuePopup(issue) {
    return `
        <div style="max-width: 200px;">
            <h4 style="margin: 0 0 5px 0; font-size: 1rem;">${issue.title}</h4>
            <p style="margin: 5px 0; font-size: 0.875rem;">
                <span class="status-badge status-${issue.status}">${formatStatus(issue.status)}</span>
            </p>
            <p style="margin: 5px 0; font-size: 0.875rem; color: #64748b;">
                ${issue.upvoteCount || 0} upvotes · ${issue.category}
            </p>
            <p style="margin: 5px 0; font-size: 0.75rem; color: #94a3b8;">
                Click marker to view details
            </p>
        </div>
    `;
}

// Add heatmap layer to map
function addHeatmapLayer(map, issues) {
    // Remove existing heatmap layer if present
    if (map.getLayer('issues-heatmap')) {
        map.removeLayer('issues-heatmap');
    }
    if (map.getSource('issues-heatmap')) {
        map.removeSource('issues-heatmap');
    }
    
    // Extract issue coordinates
    const heatmapFeatures = issues
        .filter(issue => {
            return (issue.latitude && issue.longitude) || 
                   (issue.location && issue.location.coordinates);
        })
        .map(issue => {
            let lat, lng;
            if (issue.location && issue.location.coordinates) {
                [lng, lat] = issue.location.coordinates;
            } else {
                lat = issue.latitude;
                lng = issue.longitude;
            }
            return {
                type: 'Feature',
                properties: {
                    intensity: issue.upvoteCount || 1
                },
                geometry: {
                    type: 'Point',
                    coordinates: [lng, lat]
                }
            };
        });
    
    if (heatmapFeatures.length === 0) {
        return;
    }
    
    // Add heatmap source
    map.addSource('issues-heatmap', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: heatmapFeatures
        }
    });
    
    // Add heatmap layer
    map.addLayer({
        id: 'issues-heatmap',
        type: 'heatmap',
        source: 'issues-heatmap',
        paint: {
            'heatmap-weight': [
                'interpolate',
                ['linear'],
                ['get', 'intensity'],
                0, 0,
                6, 1
            ],
            'heatmap-intensity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                0, 1,
                15, 3
            ],
            'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0, 'rgba(33,102,172,0)',
                0.2, 'rgb(103,169,207)',
                0.4, 'rgb(209,229,240)',
                0.6, 'rgb(253,219,199)',
                0.8, 'rgb(239,138,98)',
                1, 'rgb(178,24,43)'
            ],
            'heatmap-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                0, 2,
                15, 20
            ],
            'heatmap-opacity': 0.7
        }
    }, 'waterway-label');
}

// Remove heatmap layer
function removeHeatmapLayer(map) {
    if (map.getLayer('issues-heatmap')) {
        map.removeLayer('issues-heatmap');
    }
    if (map.getSource('issues-heatmap')) {
        map.removeSource('issues-heatmap');
    }
}

// Fetch and display nearby issues
async function showNearbyIssues(map, radius = 10) {
    try {
        // Get current location
        const location = await getCurrentLocation();
        
        // Fetch nearby issues
        const response = await fetch(
            `${API_URL}/issues/nearby?lat=${location.lat}&lng=${location.lng}&radius=${radius}`,
            {
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error('Failed to fetch nearby issues');
        }
        
        const data = await response.json();
        
        // Display issues on map
        displayIssuesOnMap(map, data.issues);
        
        // Add user location marker
        const userMarkerEl = document.createElement('div');
        userMarkerEl.className = 'user-location-marker';
        userMarkerEl.style.width = '20px';
        userMarkerEl.style.height = '20px';
        userMarkerEl.style.borderRadius = '50%';
        userMarkerEl.style.backgroundColor = '#ef4444';
        userMarkerEl.style.border = '3px solid white';
        userMarkerEl.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.3)';
        
        new maplibregl.Marker({ element: userMarkerEl })
            .setLngLat([location.lng, location.lat])
            .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML('<p>Your Location</p>'))
            .addTo(map);
        
        // Center map on user location
        map.flyTo({
            center: [location.lng, location.lat],
            zoom: 12,
            duration: 1500
        });
        
        return { issues: data.issues, location, count: data.count };
    } catch (error) {
        console.error('Error showing nearby issues:', error);
        throw error;
    }
}

// Format status text
function formatStatus(status) {
    const statusMap = {
        'pending': 'Pending',
        'accepted': 'Accepted',
        'in-progress': 'In Progress',
        'in_progress': 'In Progress',
        'resolved': 'Resolved',
        'rejected': 'Rejected',
        'denied': 'Denied'
    };
    return statusMap[status] || status;
}
