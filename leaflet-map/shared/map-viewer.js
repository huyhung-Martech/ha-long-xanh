// Lấy dự án hiện tại từ URL hoặc mặc định là 'vinh-xanh'
const urlParams = new URLSearchParams(window.location.search);
const currentProject = urlParams.get('project') || 'vinh-xanh';

const projectMetadata = {
  'vinh-xanh': {
    title: 'Phân khu Vịnh Xanh',
    subtitle: 'Vinhomes Ocean Park 3 - Bản đồ tương tác',
    center: [-103, 60],
    zoom: 2,
    maxNativeZoom: 7,
    variableName: 'vinhXanhData',
    getData: () => typeof vinhXanhData !== 'undefined' ? vinhXanhData : null
  },
  'global-gate-ha-long': {
    title: 'Vinhomes Global Gate',
    subtitle: 'Vinhomes Global Gate Hạ Long - Bản đồ tương tác',
    center: [-142, 95],
    zoom: 3,
    maxNativeZoom: 7,
    variableName: 'globalGateData',
    getData: () => typeof globalGateData !== 'undefined' ? globalGateData : null
  }
};

const meta = projectMetadata[currentProject] || {
  title: 'Bản đồ Phân lô',
  subtitle: 'Bản đồ tương tác',
  center: [-100, 100],
  zoom: 2,
  maxNativeZoom: 7,
  variableName: 'projectData',
  getData: () => null
};

// Chuyển đổi dự án qua Dropdown
window.changeProject = function(newProject) {
  const url = new URL(window.location.href);
  url.searchParams.set('project', newProject);
  window.location.href = url.href;
};

    let map;

    let markersLayer = L.layerGroup();

    let allLotsData = [];

    let currentFilter = 'all';

    let searchQuery = '';

    let markerInstances = {}; // Store reference to markers for quick access

    let isEditMode = false;



    // Initialize Map on Page Load
    function start() {
      // Thiết lập giá trị dropdown dự án khớp với URL
      const selector = document.getElementById('project-selector');
      if (selector) {
        selector.value = currentProject;
      }
      
      // Thiết lập tiêu đề dự án động
      document.getElementById('project-title').textContent = meta.title;
      document.getElementById('project-subtitle').textContent = meta.subtitle;
      document.getElementById('loading-text').textContent = 'Đang tải dữ liệu phân lô ' + (meta.title.replace('Phân khu ', '')) + '...';
      document.title = meta.title + ' - Bản đồ Tương tác';

      // Điều khiển hiển thị thanh công cụ và sidebar dựa theo URL (ẩn khi chạy trên web chính)
      const isEditParam = urlParams.get('edit') === 'true';
      const editorToolbar = document.getElementById('editor-toolbar');
      if (editorToolbar) {
        editorToolbar.style.display = isEditParam ? 'flex' : 'none';
      }
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        sidebar.style.display = isEditParam ? 'flex' : 'none';
      }

      initMap();

      loadData();
    }

    if (document.readyState === 'loading') {
      window.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }



    function initMap() {

      // Sử dụng CRS.Simple cho hệ tọa độ phẳng pixel
      map = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: 0,
        maxZoom: 9,
        zoomControl: false,
        attributionControl: false
      });

      // Đường dẫn bộ Tiles cục bộ động của từng dự án
      const tileUrl = `./projects/${currentProject}/tiles/{z}/{x}/{y}.webp`;

      L.tileLayer(tileUrl, {
        maxZoom: 9,
        maxNativeZoom: meta.maxNativeZoom,
        minZoom: 0,
        noWrap: true
      }).addTo(map);

      // Đặt góc nhìn trung tâm dựa theo hệ tọa độ phẳng của dự án
      map.setView(meta.center, meta.zoom);

      // Thêm nút zoom ở phía bên phải
      L.control.zoom({ position: 'topright' }).addTo(map);

      markersLayer.addTo(map);

      // Click đúp bản đồ để tạo lô đất mới khi ở chế độ chỉnh sửa
      map.on('dblclick', function(event) {
        if (!isEditMode) return;
        openAddLotForm(event.latlng);
      });

      // Click bản đồ để thêm marker hoặc tắt highlight
      map.on('click', function(event) {
        if (isAddingMarkerMode) {
          isAddingMarkerMode = false;
          document.getElementById('map').style.cursor = '';
          openAddLotForm(event.latlng);
        } else {
          if (currentlyHighlightedCode) {
            const el = document.getElementById(`marker-${currentlyHighlightedCode}`);
            if (el) el.classList.remove('highlighted');
            currentlyHighlightedCode = null;
          }
        }
      });

    }



    // Load coordinates from inlined data

    function loadData() {

      const json = typeof meta.getData === 'function' ? meta.getData() : null;

      if (!json) {
        console.error("Không tìm thấy dữ liệu cho dự án: " + currentProject);
        return;
      }

      // Parse data array

      if (json && json.data && Array.isArray(json.data)) {
        if (json.data.length > 0 && json.data[0].apartment_data) {
          allLotsData = json.data[0].apartment_data;
        } else {
          allLotsData = json.data;
        }
      } else if (Array.isArray(json)) {
        allLotsData = json;
      } else {
        allLotsData = [];
      }



      console.log("Đã load thành công", allLotsData.length, "căn hộ.");

      

      // Render markers and sidebar list

      renderMarkers();

      renderSidebarList();

      

      // Hide loading

      document.getElementById('loading-overlay').style.opacity = 0;

      setTimeout(() => {

        document.getElementById('loading-overlay').style.display = 'none';

      }, 400);

    }



    // Render Leaflet Markers

    function renderMarkers() {

      markersLayer.clearLayers();

      markerInstances = {};



      allLotsData.forEach(lot => {

        // Kiểm tra điều kiện bộ lọc và tìm kiếm

        const matchesStatus = currentFilter === 'all' || lot.state_line === currentFilter;

        const matchesSearch = lot.product_code.toLowerCase().includes(searchQuery.toLowerCase());



        if (matchesStatus && matchesSearch) {

          const lat = parseFloat(lot.coordinate_y);

          const lng = parseFloat(lot.coordinate_x);



          if (!isNaN(lat) && !isNaN(lng)) {

            // Kiểu dáng Marker
            let shapeClass = 'shape-circle';
            if (lot.marker_shape === 'square') shapeClass = 'shape-square';
            else if (lot.marker_shape === 'pin') shapeClass = 'shape-pin';

            // Màu sắc Marker
            let colorClass = 'color-green';
            if (lot.marker_color && lot.marker_color !== 'default') {
              colorClass = 'color-' + lot.marker_color;
            } else {
              colorClass = lot.state_line === 'available' ? 'color-green' : (lot.state_line === 'sold' ? 'color-red' : 'color-orange');
            }

            const shortName = lot.product_code.replace(/^[a-zA-Z]+/, "");

            // Tự động điều chỉnh cỡ chữ theo độ dài để tránh bị xuống dòng
            let fontSizeStyle = '';
            if (shortName.length >= 5) {
              fontSizeStyle = 'font-size: 6px;';
            } else if (shortName.length === 4) {
              fontSizeStyle = 'font-size: 7px;';
            }

            const markerHtml = `
              <div class="marker-dot ${shapeClass} ${colorClass}" title="${lot.product_code}" id="marker-${lot.product_code}">
                <span style="white-space: nowrap; display: inline-block; ${fontSizeStyle}">${shortName}</span>
              </div>
            `;



            const customIcon = L.divIcon({

              html: markerHtml,

              className: 'custom-marker',

              iconSize: [24, 24],

              iconAnchor: [12, 12]

            });



            // Place Marker
            const marker = L.marker([lat, lng], { 
              icon: customIcon,
              draggable: isEditMode
            });

            marker.on('dragend', function(event) {
              const position = event.target.getLatLng();
              lot.coordinate_y = parseFloat(position.lat.toFixed(2));
              lot.coordinate_x = parseFloat(position.lng.toFixed(2));
              console.log("Đã cập nhật tọa độ " + lot.product_code + ": x=" + lot.coordinate_x + ", y=" + lot.coordinate_y);
            });

            // Gắn sự kiện click mở biểu mẫu sửa (nếu đang ở chế độ chỉnh sửa) hoặc mở modal chi tiết premium (chế độ xem)
            marker.on('click', function(event) {
              L.DomEvent.stopPropagation(event);
              if (isEditMode) {
                openEditLotForm(lot);
              } else {
                highlightMarker(lot.product_code);
                openDetailModal(lot);
              }
            });

            markersLayer.addLayer(marker);



            // Store instance

            markerInstances[lot.product_code] = marker;

          }

        }

      });

    }



    // Render sidebar List

    function renderSidebarList() {

      const listEl = document.getElementById('lot-list');

      listEl.innerHTML = '';



      let count = 0;

      allLotsData.forEach(lot => {

        const matchesStatus = currentFilter === 'all' || lot.state_line === currentFilter;

        const matchesSearch = lot.product_code.toLowerCase().includes(searchQuery.toLowerCase());



        if (matchesStatus && matchesSearch) {

          count++;

          const formattedPrice = formatPriceBillion(lot.apartment_price);

          const statusBadge = lot.state_line === 'available' 

            ? '<span class="badge badge-available">Còn</span>' 

            : '<span class="badge badge-sold">Hết</span>';



          const itemEl = document.createElement('div');

          itemEl.className = 'lot-item';

          itemEl.onclick = () => focusOnLot(lot.product_code);

          itemEl.innerHTML = `

            <div class="lot-item-info">

              <h3>Lô ${lot.product_code}</h3>

              <p>Giá: <span style="color:#38bdf8;font-weight:600;">${formattedPrice}</span></p>

            </div>

            <div>

              ${statusBadge}

            </div>

          `;

          listEl.appendChild(itemEl);

        }

      });



      if (count === 0) {

        listEl.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:14px;margin-top:20px;">Không tìm thấy lô phù hợp.</div>`;

      }

    }



    // Helper to format Price (e.g. 53421849985.0 -> 53.42 Tỷ)

    function formatPriceBillion(price) {

      if (!price || isNaN(price)) return "Liên hệ";

      const billion = price / 1000000000;

      return billion.toFixed(2) + " Tỷ";

    }



    // Filter by Available / Sold / All

    function filterStatus(status) {

      currentFilter = status;

      document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));

      document.getElementById(`btn-${status}`).classList.add('active');

      renderMarkers();

      renderSidebarList();

    }



    // Search input handler

    function handleSearch() {

      searchQuery = document.getElementById('search-input').value.trim();

      renderMarkers();

      renderSidebarList();

    }



    // Zoom and pan to a specific lot

    // Zoom and pan to a specific lot
    function focusOnLot(code) {
      const marker = markerInstances[code];
      if (marker) {
        const latlng = marker.getLatLng();
        map.flyTo(latlng, 4, { animate: true, duration: 0.8 });
        
        // Highlight the marker
        highlightMarker(code);
      }
    }

    // Highlight Marker Function
    let currentlyHighlightedCode = null;

    function highlightMarker(code) {
      // Remove highlight from all markers
      document.querySelectorAll('.marker-dot').forEach(el => {
        el.classList.remove('highlighted');
      });

      currentlyHighlightedCode = code;
      
      // Highlight new marker
      const el = document.getElementById(`marker-${code}`);
      if (el) {
        el.classList.add('highlighted');
      } else {
        // If element is not rendered in DOM yet, wait for moveend
        map.once('moveend', () => {
          const elRetry = document.getElementById(`marker-${code}`);
          if (elRetry) elRetry.classList.add('highlighted');
        });
      }
    }

    // Popup local action zoom
    window.zoomToLot = function(code) {
      focusOnLot(code);
    }

    let isAddingMarkerMode = false;

    window.startAddingMarker = function() {
      if (!isEditMode) {
        toggleEditMode();
      }
      isAddingMarkerMode = true;
      document.getElementById('map').style.cursor = 'crosshair';
      alert("Chế độ Thêm Marker đã bật! Click vào một vị trí bất kỳ trên bản đồ để thả ghim đặt Marker mới.");
    };

    // Toggle Editor Mode
    window.toggleEditMode = function() {
      isEditMode = !isEditMode;
      const btn = document.getElementById('btn-toggle-edit');
      const addBtn = document.getElementById('btn-add-marker');
      if (isEditMode) {
        btn.classList.add('active-edit');
        btn.innerHTML = '🛑 Tắt Chỉnh sửa';
        if (addBtn) addBtn.style.display = 'block';
        alert('Đã BẬT chế độ chỉnh sửa! Bạn có thể:\n- Kéo thả các marker để đổi vị trí.\n- Click đúp vào bản đồ để tạo marker mới.\n- Click vào nút "Thêm Marker Mới" để đặt ghim mới.\n- Click vào một marker bất kỳ để sửa thông tin hoặc xóa.');
      } else {
        btn.classList.remove('active-edit');
        btn.innerHTML = '🔧 Bật Chỉnh sửa';
        if (addBtn) addBtn.style.display = 'none';
        isAddingMarkerMode = false;
        document.getElementById('map').style.cursor = '';
        alert('Đã TẮT chế độ chỉnh sửa.');
      }
      renderMarkers();
    };

    // Open Form to Add a New Lot
    window.openAddLotForm = function(latlng) {
      document.getElementById('edit-modal-title').innerText = "Thêm mới Lô đất";
      document.getElementById('edit-index').value = ""; // Empty index means new lot
      document.getElementById('edit-lat').value = latlng.lat;
      document.getElementById('edit-lng').value = latlng.lng;
      
      // Clear inputs
      document.getElementById('edit-code').value = "";
      document.getElementById('edit-state').value = "available";
      document.getElementById('edit-price').value = "";
      document.getElementById('edit-land-area').value = "";
      document.getElementById('edit-build-area').value = "";
      document.getElementById('edit-type').value = "";
      document.getElementById('edit-direction').value = "";
      document.getElementById('edit-image').value = "";
      document.getElementById('edit-shape').value = "circle";
      document.getElementById('edit-color').value = "default";
      
      // Hide delete button for new lots
      document.getElementById('btn-delete-lot').style.display = 'none';
      
      document.getElementById('edit-modal').classList.add('show');
    };

    // Open Form to Edit an Existing Lot
    window.openEditLotForm = function(lot) {
      document.getElementById('edit-modal-title').innerText = "Biên tập thông tin Lô đất";
      const index = allLotsData.indexOf(lot);
      document.getElementById('edit-index').value = index;
      document.getElementById('edit-lat').value = lot.coordinate_y;
      document.getElementById('edit-lng').value = lot.coordinate_x;
      
      // Populate inputs
      document.getElementById('edit-code').value = lot.product_code || "";
      document.getElementById('edit-state').value = lot.state_line || "available";
      document.getElementById('edit-price').value = lot.apartment_price || "";
      document.getElementById('edit-land-area').value = lot.land_area || "";
      document.getElementById('edit-build-area').value = lot.construction_area || "";
      document.getElementById('edit-type').value = lot.type_name || "";
      document.getElementById('edit-direction').value = lot.direction || "";
      document.getElementById('edit-image').value = lot.image_url || "";
      document.getElementById('edit-shape').value = lot.marker_shape || "circle";
      document.getElementById('edit-color').value = lot.marker_color || "default";
      
      // Show delete button
      document.getElementById('btn-delete-lot').style.display = 'block';
      
      document.getElementById('edit-modal').classList.add('show');
    };

    // Close Edit Modal
    window.closeEditModal = function() {
      document.getElementById('edit-modal').classList.remove('show');
    };

    // Save Lot (New or Edited)
    window.saveLot = function() {
      const code = document.getElementById('edit-code').value.trim();
      if (!code) {
        alert("Vui lòng nhập Mã căn!");
        return;
      }
      
      const indexStr = document.getElementById('edit-index').value;
      const state = document.getElementById('edit-state').value;
      const price = parseFloat(document.getElementById('edit-price').value) || 0;
      const landArea = parseFloat(document.getElementById('edit-land-area').value) || 0;
      const buildArea = parseFloat(document.getElementById('edit-build-area').value) || 0;
      const type = document.getElementById('edit-type').value.trim();
      const direction = document.getElementById('edit-direction').value.trim();
      const image = document.getElementById('edit-image').value.trim();
      const shape = document.getElementById('edit-shape').value;
      const color = document.getElementById('edit-color').value;
      const lat = parseFloat(document.getElementById('edit-lat').value);
      const lng = parseFloat(document.getElementById('edit-lng').value);
      
      if (indexStr === "") {
        // Creating a new lot
        const newLot = {
          product_code: code,
          state_line: state,
          apartment_price: price,
          land_area: landArea,
          construction_area: buildArea,
          type_name: type,
          direction: direction,
          image_url: image,
          marker_shape: shape,
          marker_color: color,
          coordinate_x: lng,
          coordinate_y: lat,
          subdivision_id: 4777,
          project_id: 355,
          fund_groups_sell_code: "QA"
        };
        allLotsData.push(newLot);
        console.log("Đã thêm lô đất mới:", newLot);
      } else {
        // Updating existing lot
        const idx = parseInt(indexStr);
        if (idx >= 0 && idx < allLotsData.length) {
          const lot = allLotsData[idx];
          lot.product_code = code;
          lot.state_line = state;
          lot.apartment_price = price;
          lot.land_area = landArea;
          lot.construction_area = buildArea;
          lot.type_name = type;
          lot.direction = direction;
          lot.image_url = image;
          lot.marker_shape = shape;
          lot.marker_color = color;
          console.log("Đã cập nhật thông tin lô đất:", lot);
        }
      }
      
      renderMarkers();
      renderSidebarList();
      closeEditModal();
    };

    // Delete Lot
    window.deleteLot = function() {
      const indexStr = document.getElementById('edit-index').value;
      if (indexStr !== "") {
        const idx = parseInt(indexStr);
        const code = allLotsData[idx].product_code;
        if (confirm("Bạn có chắc chắn muốn xóa lô đất " + code + " không?")) {
          allLotsData.splice(idx, 1);
          console.log("Đã xóa lô đất:", code);
          renderMarkers();
          renderSidebarList();
          closeEditModal();
        }
      }
    };

    // Open Premium Property Details Modal
    window.openDetailModal = function(lot) {
      // Phát tín hiệu gửi mã căn ra trang web cha (nhúng qua iframe)
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          action: 'select_lot',
          product_code: lot.product_code
        }, '*');
        return; // Không mở thêm popup phụ bên trong iframe nữa để tránh trùng lặp
      }

      document.getElementById('detail-code').innerText = lot.product_code;
      document.getElementById('detail-price').innerText = formatPriceBillion(lot.apartment_price);
      document.getElementById('detail-land').innerText = lot.land_area ? lot.land_area + " m²" : "-- m²";
      document.getElementById('detail-build').innerText = lot.construction_area ? lot.construction_area + " m²" : "-- m²";
      document.getElementById('detail-type').innerText = lot.type_name || "--";
      document.getElementById('detail-direction').innerText = lot.direction || "--";
      
      // Calculate unit price per m2
      if (lot.apartment_price && lot.land_area) {
        const unit = (lot.apartment_price / lot.land_area / 1000000).toFixed(1);
        document.getElementById('detail-unit-price').innerText = "~" + unit + " triệu/m²";
      } else {
        document.getElementById('detail-unit-price').innerText = "Liên hệ";
      }
      
      // State badge styling
      const badge = document.getElementById('detail-state-badge');
      badge.className = "badge";
      if (lot.state_line === 'available') {
        badge.classList.add('badge-available');
        badge.innerText = "Còn hàng";
      } else if (lot.state_line === 'sold') {
        badge.classList.add('badge-sold');
        badge.innerText = "Đã bán";
      } else {
        badge.classList.add('badge-sold'); // fallback
        badge.innerText = "Đã bán";
      }
      
      // Set Design Layout Image
      const imgEl = document.getElementById('detail-image');
      if (lot.image_url) {
        imgEl.src = lot.image_url;
      } else {
        // Default layout template image as fallback
        imgEl.src = "../landing parkland/images/layouts/mb-dien-hinh-toa-p5.jpg";
      }
      
      document.getElementById('detail-modal').classList.add('show');
    };

    // Close Detail Modal
    window.closeDetailModal = function() {
      document.getElementById('detail-modal').classList.remove('show');
    };

    // Toggle fullscreen image
    window.toggleFullScreenImage = function() {
      const src = document.getElementById('detail-image').src;
      document.getElementById('image-fullscreen').src = src;
      document.getElementById('image-fullscreen-modal').classList.add('show');
    };

    window.closeFullScreenImage = function() {
      document.getElementById('image-fullscreen-modal').classList.remove('show');
    };

    // Action CTA handlers
    window.actionCheckCan = function() {
      const code = document.getElementById('detail-code').innerText;
      alert("Đang gửi yêu cầu CHECK CĂN cho lô: " + code);
    };

    window.actionLockCan = function() {
      const code = document.getElementById('detail-code').innerText;
      alert("Đang gửi yêu cầu LOCK CĂN cho lô: " + code);
    };

    // Export Coordinates to JSON
    window.exportCoordinates = function() {
      const outputJSON = {
        "status": "success",
        "data": [
          {
            "subdivision_id": 4777,
            "subdivision_code": "VX",
            "subdivision_name": "Vịnh Xanh",
            "apartment_data": allLotsData
          }
        ]
      };
      
      const textarea = document.getElementById('json-output');
      textarea.value = JSON.stringify(outputJSON, null, 2);
      
      const modal = document.getElementById('export-modal');
      modal.classList.add('show');
    };

    // Close Modal
    window.closeModal = function() {
      document.getElementById('export-modal').classList.remove('show');
    };

    // Copy JSON to Clipboard
    window.copyJSON = function() {
      const textarea = document.getElementById('json-output');
      textarea.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textarea.value).then(() => {
          alert('Đã sao chép JSON vào bộ nhớ tạm!');
        }).catch(err => {
          document.execCommand('copy');
          alert('Đã sao chép JSON vào bộ nhớ tạm (fallback)!');
        });
      } else {
        document.execCommand('copy');
        alert('Đã sao chép JSON vào bộ nhớ tạm!');
      }
    };

    // Download data.js as a file
    window.downloadJSONFile = function() {
      const textarea = document.getElementById('json-output');
      const varName = meta.variableName || 'projectData';
      const jsContent = "const " + varName + " = " + textarea.value + ";";
      const dataStr = "data:text/javascript;charset=utf-8," + encodeURIComponent(jsContent);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "data.js");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    };

    // ==========================================
    // FLOATING SEARCH & AUTOCOMPLETE LOGIC
    // ==========================================

    window.showDropdown = function() {
      const dropdown = document.getElementById('floating-search-dropdown');
      if (dropdown) {
        dropdown.classList.add('show');
        renderFloatingDropdownList();
      }
    };

    window.hideDropdown = function() {
      setTimeout(() => {
        const dropdown = document.getElementById('floating-search-dropdown');
        if (dropdown) {
          dropdown.classList.remove('show');
        }
      }, 200); // Trì hoãn một chút để sự kiện click của các item trong dropdown kịp kích hoạt
    };

    window.toggleDropdown = function(event) {
      if (event) event.stopPropagation();
      const dropdown = document.getElementById('floating-search-dropdown');
      const trigger = document.querySelector('.dropdown-trigger-btn');
      if (dropdown) {
        const isShown = dropdown.classList.toggle('show');
        if (isShown) {
          if (trigger) trigger.classList.add('open');
          renderFloatingDropdownList();
        } else {
          if (trigger) trigger.classList.remove('open');
        }
      }
    };

    window.handleFloatingSearch = function() {
      const query = document.getElementById('floating-search-input').value.toLowerCase().trim();
      const dropdown = document.getElementById('floating-search-dropdown');
      if (dropdown) {
        dropdown.classList.add('show');
        renderFloatingDropdownList(query);
      }
    };

    window.renderFloatingDropdownList = function(query = '') {
      const dropdown = document.getElementById('floating-search-dropdown');
      if (!dropdown) return;
      dropdown.innerHTML = '';

      const filtered = allLotsData.filter(lot => {
        if (!lot.product_code) return false;
        return lot.product_code.toLowerCase().includes(query);
      });

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '12px';
        empty.style.textAlign = 'center';
        empty.style.fontSize = '12px';
        empty.style.color = '#64748b';
        empty.textContent = 'Không tìm thấy căn hộ';
        dropdown.appendChild(empty);
        return;
      }

      filtered.forEach(lot => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        
        let statusClass = 'status-available';
        let statusText = 'Còn hàng';
        if (lot.state_line === 'sold') {
          statusClass = 'status-sold';
          statusText = 'Đã bán';
        } else if (lot.state_line === 'locked') {
          statusClass = 'status-locked';
          statusText = 'Đang khóa';
        }

        const areaStr = lot.land_area ? `${lot.land_area}m²` : '';
        const priceStr = lot.apartment_price ? `${(lot.apartment_price / 1000000000).toFixed(1)} tỷ` : 'Liên hệ';

        item.innerHTML = `
          <div>
            <span class="dropdown-item-code">${lot.product_code}</span>
            <span class="dropdown-item-status ${statusClass}">${statusText}</span>
          </div>
          <div class="dropdown-item-info">
            <div>${priceStr}</div>
            <div style="font-size: 9px; color: #64748b; margin-top: 2px;">${areaStr}</div>
          </div>
        `;

        item.onclick = function() {
          document.getElementById('floating-search-input').value = lot.product_code;
          dropdown.classList.remove('show');
          const trigger = document.querySelector('.dropdown-trigger-btn');
          if (trigger) trigger.classList.remove('open');
          
          // Di chuyển tâm bản đồ tới Marker tương ứng và kích hoạt sự kiện click
          if (markerInstances[lot.product_code]) {
            const marker = markerInstances[lot.product_code];
            map.setView(marker.getLatLng(), 4);
            marker.fire('click');
          }
        };

        dropdown.appendChild(item);
      });
    };

    // Đóng dropdown khi click ra ngoài
    document.addEventListener('click', function(event) {
      const container = document.querySelector('.floating-search-container');
      if (container && !container.contains(event.target)) {
        const dropdown = document.getElementById('floating-search-dropdown');
        const trigger = document.querySelector('.dropdown-trigger-btn');
        if (dropdown) {
          dropdown.classList.remove('show');
          if (trigger) trigger.classList.remove('open');
        }
      }
    });

    window.recenterMap = function() {
      if (map && meta && meta.center) {
        map.setView(meta.center, meta.zoom);
      }
    };

    window.clearFloatingSearch = function() {
      const input = document.getElementById('floating-search-input');
      if (input) {
        input.value = '';
        renderFloatingDropdownList();
      }
    };

