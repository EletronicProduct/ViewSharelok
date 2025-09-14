document.addEventListener('DOMContentLoaded', () => {
    const firebaseConfig = {
    apiKey: "AIzaSyCalf-RcByWIxdE3kyhcWwNwd8kSGX_fLE",
    authDomain: "absensi2-741f0.firebaseapp.com",
    databaseURL: "https://absensi2-741f0-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "absensi2-741f0",
    storageBucket: "absensi2-741f0.firebasestorage.app",
    messagingSenderId: "747934727309",
    appId: "1:747934727309:web:0c1fbacd980c4bdf2bb6c4",
    measurementId: "G-DGLR9P3Z33"
    };
    const app = new Vue({
        el: '#app',
        vuetify: new Vuetify(),
        data: () => ({
            map: null,
            users: [],
            notifications: [],
            markers: {},
            polylines: {},
            accuracyCircles: {},
            db: null,
            showBottomSheet: false,
            tab: null,
        }),
        mounted() {
            this.initFirebase();
            this.initMap();
        },
        methods: {
            initFirebase() {
                try {
                    firebase.initializeApp(firebaseConfig);
                    this.db = firebase.database();
                    this.monitorUsers();
                } catch (e) {
                    console.error("Firebase initialization error:", e);
                    this.addNotification('error', 'Gagal terhubung ke Firebase.');
                }
            },
            initMap() {
                this.map = L.map('map-container').setView([-6.2088, 106.8456], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(this.map);
            },
            monitorUsers() {
                if (!this.db) return;
                
                // MENGUBAH JALUR INI
                this.db.ref('location-data').on('value', snapshot => {
                    const data = snapshot.val();
                    if (!data) {
                        this.users = [];
                        return;
                    }
                    
                    const userArray = Object.keys(data).map(key => ({
                        id: key,
                        name: key.replace(/_/g, ' '),
                        address: 'Mencari alamat...',
                        heading: data[key].heading || 0,
                        accuracy: data[key].accuracy || 0,
                        ...data[key]
                    }));
                    
                    this.users = userArray;
                    this.updateMapMarkers();
                });
                
                // MENGUBAH JALUR INI
                this.db.ref('location-data').on('child_added', snapshot => {
                    const userId = snapshot.key;
                    this.db.ref('location-data/' + userId).on('child_added', updateSnapshot => {
                        const update = updateSnapshot.val();
                        this.drawUserPath(userId, update);
                        if (update.riskLevel === 'high') {
                            this.addNotification('error', `Fake GPS terdeteksi pada ${update.name}!`);
                        }
                    });
                });
            },
            updateMapMarkers() {
                this.users.forEach(user => {
                    const latLng = [user.lat, user.lng];
                    const isFake = user.riskLevel === 'high';
                    
                    const customIconHtml = `
                                
                                        <div class="custom-marker-icon ${user.heading === undefined ? 'no-heading' : ''}" 
                                            style="transform: rotate(${user.heading || 0}deg);">
                                            <div class="arrow"></div>
                                        </div>
                                    `;
                    const customIcon = L.divIcon({
                        className: 'custom-marker-div-icon',
                        html: customIconHtml,
                        iconSize: [20, 30],
                        iconAnchor: [10, 30]
                    });
                    
                    if (this.markers[user.id]) {
                        this.markers[user.id].setLatLng(latLng);
                        const iconElement = this.markers[user.id]._icon.querySelector('.custom-marker-icon');
                        if (iconElement) {
                            iconElement.style.transform = `rotate(${user.heading || 0}deg)`;
                            if (user.heading === undefined) {
                                iconElement.classList.add('no-heading');
                            } else {
                                iconElement.classList.remove('no-heading');
                            }
                        }
                    } else {
                        this.markers[user.id] = L.marker(latLng, { icon: customIcon }).addTo(this.map);
                    }
                    
                    if (user.accuracy > 0) {
                        if (this.accuracyCircles[user.id]) {
                            this.accuracyCircles[user.id].setLatLng(latLng).setRadius(user.accuracy);
                        } else {
                            this.accuracyCircles[user.id] = L.circle(latLng, {
                                radius: user.accuracy,
                                className: 'accuracy-circle'
                            }).addTo(this.map);
                        }
                    } else {
                        if (this.accuracyCircles[user.id]) {
                            this.map.removeLayer(this.accuracyCircles[user.id]);
                            delete this.accuracyCircles[user.id];
                        }
                    }
                    
                    this.reverseGeocode(user.lat, user.lng).then(address => {
                        const userIndex = this.users.findIndex(u => u.id === user.id);
                        if (userIndex !== -1) {
                            this.$set(this.users[userIndex], 'address', address);
                        }
                        if (this.markers[user.id]) {
                            this.markers[user.id].bindPopup(this.createPopupContent(this.users[userIndex]));
                        }
                    }).catch(error => {
                        console.error("Geocoding failed for", user.name, ":", error);
                        const userIndex = this.users.findIndex(u => u.id === user.id);
                        if (userIndex !== -1) {
                            this.$set(this.users[userIndex], 'address', 'Alamat tidak ditemukan.');
                        }
                    });
                });
            },
            async reverseGeocode(lat, lng) {
                const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
                try {
                    const response = await fetch(url);
                    const data = await response.json();
                    if (data.display_name) {
                        return data.display_name;
                    } else {
                        return 'Alamat tidak ditemukan.';
                    }
                } catch (error) {
                    return 'Gagal mengambil alamat.';
                }
            },
            drawUserPath(userId, update) {
                const latLng = [update.lat, update.lng];
                if (!this.polylines[userId]) {
                    this.polylines[userId] = L.polyline([], { color: 'blue', weight: 3 }).addTo(this.map);
                }
                this.polylines[userId].addLatLng(latLng);
            },
            panToUser(user) {
                if (user.lat && user.lng) {
                    this.map.panTo([user.lat, user.lng]);
                    this.showBottomSheet = false;
                    if (this.markers[user.id]) {
                        this.markers[user.id].openPopup();
                    }
                }
            },
            addNotification(type, message) {
                this.notifications.unshift({ type, message, time: Date.now() });
            },
            createPopupContent(user) {
                const statusColor = user.status === 'active' ? 'green' : 'red';
                const riskColor = user.riskLevel === 'high' ? 'red' : user.riskLevel === 'medium' ? 'orange' : 'green';
                const addressDisplay = user.address || 'Mencari alamat...';
                
                return `
                                <strong>Nama:</strong> ${user.name}<br>
                                <strong>Status:</strong> <span style="color:${statusColor}">${user.status}</span><br>
                                <strong>Resiko:</strong> <span style="color:${riskColor}">${user.riskLevel}</span><br>
                                <strong>Last Update:</strong> ${new Date(user.timestamp).toLocaleString()}<br>
                                <strong>Alamat:</strong> ${addressDisplay}<br>
                                <strong>Accuracy:</strong> ${user.accuracy ? user.accuracy.toFixed(2) + 'm' : 'N/A'}<br>
                                <strong>Updates:</strong> ${user.updateCount}<br>
                                <strong>Isu:</strong> ${user.issues.join(', ') || 'None'}
                            `;
            }
        }
    });
});
