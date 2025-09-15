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
      email: '',
      password: '',
      userLoggedIn: false,
    }),
    mounted() {
      this.initMap();
      this.startListeningForData(); // Panggil fungsi baru
      this.monitorAuthStatus(); // Panggil fungsi untuk memantau status login
    },
    methods: {
      initMap() {
        this.map = L.map('map-container').setView([-6.2088, 106.8456], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
      },
      monitorAuthStatus() {
        firebase.auth().onAuthStateChanged(user => {
          this.userLoggedIn = !!user;
        });
      },
      startListeningForData() {
        if (!this.db) {
          this.addNotification('error', 'Gagal terhubung ke Firebase.');
          return;
        }
        
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
          }).filter(user => user.lat && user.lng);
          
          userArray.forEach(user => {
            if (user.riskLevel === 'high' || user.riskLevel === 'medium') {
              const message = `⚠️ Aktivitas mencurigakan dari **${user.name}**. Isu: ${user.issues.join(', ')}`;
              const type = user.riskLevel === 'high' ? 'error' : 'warning';
              
              const isDuplicate = this.notifications.some(n =>
                n.id === user.id && n.message.includes(user.riskLevel)
              );
              
              if (!isDuplicate) {
                this.addNotification(type, message, user.id);
              }
            }
          });
          
          this.users = userArray;
          this.updateMapMarkers();
        });
      },
      updateMapMarkers() {
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
      addNotification(type, message, userId = null) {
        const now = new Date().toLocaleString();
        this.notifications.unshift({ type, message, userId, time: now });
      },
      
      async deleteBotData() {
        if (!this.userLoggedIn) {
this.addNotification('error', 'Anda harus login sebagai admin untuk melakukan ini.');
return;
}
console.log("Mulai membersihkan data bot...");
       if (!confirm('Apakah Anda yakin ingin menghapus data bot dari semua user?')) {
       return;
        } 
        
        const dbRef = this.db.ref('location-data');
        try {
          const snapshot = await dbRef.once('value');
          const usersData = snapshot.val();
          if (!usersData) {
            console.log("Tidak ada data untuk dibersihkan.");
            this.addNotification('info', 'Tidak ada data bot yang ditemukan.');
            return;
          }
          
          let deletedCount = 0;
          for (const userId in usersData) {
            const userData = usersData[userId];
            for (const timestamp in userData) {
              if (timestamp === 'latest') continue;
              const entry = userData[timestamp];
              if (entry.riskLevel === 'high') {
                await this.db.ref(`location-data/${userId}/${timestamp}`).remove();
                console.log(`Menghapus data bot dari user ${userId} pada timestamp ${timestamp}`);
                deletedCount++;
              }
            }
          }
          console.log(`Pembersihan data selesai. Total data bot yang dihapus: ${deletedCount}`);
          this.addNotification('success', `✅ Berhasil menghapus ${deletedCount} data bot.`);
        } catch (error) {
          console.error("Gagal membersihkan database:", error);
          this.addNotification('error', 'Gagal menghapus data bot: ' + error.message);
        }
      },
      
      async deleteUserAndData(userId) {
        if (!this.userLoggedIn) {
          this.addNotification('error', 'Anda harus login sebagai admin untuk melakukan ini.');
          return;
        }
        console.log(`Mulai menghapus semua data untuk user: ${userId}`);
        if (!confirm(`Apakah Anda yakin ingin menghapus SEMUA data user ${userId}? Aksi ini tidak bisa dibatalkan!`)) {
          return;
        }
        
        try {
          await this.db.ref(`location-data/${userId}`).remove();
          console.log(`Semua data untuk user ${userId} telah dihapus.`);
          this.addNotification('success', `✅ Berhasil menghapus semua data user ${userId}`);
        } catch (error) {
          console.error("Gagal menghapus data user:", error);
          this.addNotification('error', `Gagal menghapus data user: ${error.message}`);
        }
      },
      
      async login() {
        try {
          await firebase.auth().signInWithEmailAndPassword(this.email, this.password);
          this.addNotification('success', 'Berhasil login sebagai admin!');
        } catch (error) {
          this.addNotification('error', 'Gagal login: ' + error.message);
        }
      },
      async logout() {
        await firebase.auth().signOut();
        this.addNotification('info', 'Berhasil logout.');
      },
    },
  });
  
  window.app = app;
});
