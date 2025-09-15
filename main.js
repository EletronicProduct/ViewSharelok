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
  
  // Inisialisasi Firebase App
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  
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
      db: firebase.database(),
      showBottomSheet: false,
      tab: null,
    }),
    mounted() {
      this.initMap();
      this.monitorUsers();
    },
    methods: {
      initMap() {
        this.map = L.map('map-container').setView([-6.2088, 106.8456], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
      },
      monitorUsers() {
        if (!this.db) {
          this.addNotification('error', 'Gagal terhubung ke Firebase.');
          return;
        }
        
        // Ambil semua data user secara real-time
        this.db.ref('location-data').on('value', snapshot => {
          const data = snapshot.val();
          if (!data) {
            this.users = [];
            this.updateMapMarkers();
            return;
          }
          
          const userArray = Object.keys(data).map(key => {
            const userData = data[key];
            const latestData = userData.latest || {};
            return {
              id: key,
              name: latestData.namaKaryawan || 'User ' + key.substring(0, 6),
              lastUpdate: latestData.localTime,
              lat: latestData.lat,
              lng: latestData.lng,
              status: latestData.status,
              riskLevel: latestData.riskLevel,
              accuracy: latestData.accuracy,
              issues: latestData.issues,
              timestamp: latestData.timestamp,
              heading: latestData.heading
            };
          }).filter(user => user.lat && user.lng); // Hanya tampilkan user dengan lokasi valid
          
          this.users = userArray;
          this.updateMapMarkers();
        });
      },
      updateMapMarkers() {
        // Hapus marker yang sudah tidak ada
        Object.keys(this.markers).forEach(userId => {
          if (!this.users.some(u => u.id === userId)) {
            this.map.removeLayer(this.markers[userId]);
            delete this.markers[userId];
            if (this.accuracyCircles[userId]) {
              this.map.removeLayer(this.accuracyCircles[userId]);
              delete this.accuracyCircles[userId];
            }
          }
        });
        
        // Tambahkan atau perbarui marker
        this.users.forEach(user => {
          const latLng = [user.lat, user.lng];
          const customIconHtml = `
                        <div class="custom-marker-icon ${user.heading === undefined ? 'no-heading' : ''}" style="transform: rotate(${user.heading || 0}deg);">
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
          
          this.markers[user.id].bindPopup(this.createPopupContent(user));
        });
      },
      createPopupContent(user) {
        const statusColor = user.status === 'active' ? 'green' : 'red';
        const riskColor = user.riskLevel === 'high' ? 'red' : user.riskLevel === 'medium' ? 'orange' : 'green';
        return `
                    <strong>Nama:</strong> ${user.name}<br>
                    <strong>Status:</strong> <span style="color:${statusColor}">${user.status}</span><br>
                    <strong>Resiko:</strong> <span style="color:${riskColor}">${user.riskLevel}</span><br>
                    <strong>Update Terakhir:</strong> ${user.lastUpdate || 'N/A'}<br>
                    <strong>Akurasi:</strong> ${user.accuracy ? user.accuracy.toFixed(2) + 'm' : 'N/A'}
                `;
      },
      panToUser(user) {
        this.clearPolylines();
        if (user.lat && user.lng) {
          this.map.panTo([user.lat, user.lng]);
          this.showBottomSheet = false;
          if (this.markers[user.id]) {
            this.markers[user.id].openPopup();
          }
          this.loadUserPath(user.id);
        }
      },
      async loadUserPath(userId) {
        try {
          const snapshot = await this.db.ref(`location-data/${userId}`).once('value');
          const pathData = snapshot.val();
          if (!pathData) return;
          
          // Filter out 'latest' entry and get all historical coordinates
          const latLngs = Object.keys(pathData)
            .filter(key => key !== 'latest')
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(timestamp => {
              const location = pathData[timestamp];
              return [location.lat, location.lng];
            });
          
          if (latLngs.length > 1) {
            if (this.polylines[userId]) {
              this.map.removeLayer(this.polylines[userId]);
            }
            const polyline = L.polyline(latLngs, { color: 'blue', weight: 4 }).addTo(this.map);
            this.polylines[userId] = polyline;
            this.map.fitBounds(polyline.getBounds());
          }
        } catch (error) {
          console.error("Gagal memuat jalur user:", error);
        }
      },
      clearPolylines() {
        Object.values(this.polylines).forEach(line => this.map.removeLayer(line));
        this.polylines = {};
      },
      addNotification(type, message) {
        this.notifications.unshift({ type, message, time: Date.now() });
      }
    }
  });
});
