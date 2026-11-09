import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

test('Owner store map supports tap-to-pin, marker dragging, address search, geolocation and radius updates', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.route('https://nominatim.openstreetmap.org/search?*', async route => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get('q')).toBe('WaterNow, Hyderabad');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify([{
        lat: '17.422222',
        lon: '78.544444',
        display_name: 'WaterNow, Hyderabad, Telangana, India'
      }])
    });
  });

  await page.setContent(`
    <form id="storeForm">
      <label>Store address <input name="address" id="storeAddress"></label>
      <label>Delivery radius <input name="radius" type="number" value="5"></label>
      <section data-waternow-store-map-picker>
        <label>Find store address on map
          <input type="search" data-map-search-input autocomplete="street-address">
        </label>
        <button type="button" data-map-search-button>Find on map</button>
        <button type="button" data-map-current-location>Use my location</button>
        <div data-store-map-canvas role="application"></div>
        <p data-map-status role="status"></p>
        <input type="hidden" name="latitude" value="">
        <input type="hidden" name="longitude" value="">
      </section>
    </form>
  `);

  // Supply a deterministic Leaflet adapter so this browser test exercises the
  // real picker event handlers without depending on third-party tile/CDN uptime.
  await page.evaluate(() => {
    const mapState = { listeners: {}, zoom: 13 };
    const map = {
      on(name, callback) { mapState.listeners[name] = callback; return this; },
      off() { mapState.listeners = {}; return this; },
      remove() { this.removed = true; return this; },
      setView() { return this; },
      getZoom() { return mapState.zoom; },
      invalidateSize() { return this; },
      fire(name, payload) { mapState.listeners[name]?.(payload); return this; }
    };
    window.__waterNowTestMap = map;
    window.L = {
      map(node) {
        node.addEventListener('click', () => map.fire('click', {
          latlng: { lat: 17.410001, lng: 78.590002 }
        }));
        return map;
      },
      tileLayer() { return { addTo() { return this; } }; },
      marker(point, options) {
        let position = { lat: point[0], lng: point[1] };
        const listeners = {};
        const marker = {
          options,
          on(name, callback) { listeners[name] = callback; return this; },
          addTo() { return this; },
          setLatLng(next) {
            position = Array.isArray(next)
              ? { lat: next[0], lng: next[1] }
              : { lat: next.lat, lng: next.lng };
            return this;
          },
          getLatLng() { return position; },
          fire(name) { listeners[name]?.(); return this; }
        };
        window.__waterNowTestMarker = marker;
        return marker;
      },
      circle(point, options) {
        const circle = {
          radius: options.radius,
          addTo() { return this; },
          setLatLng() { return this; },
          setRadius(radius) { this.radius = radius; return this; }
        };
        window.__waterNowTestCircle = circle;
        return circle;
      }
    };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(success) {
          success({
            coords: { latitude: 17.430001, longitude: 78.550002, accuracy: 8 },
            timestamp: Date.now()
          });
        }
      }
    });
  });

  await page.addScriptTag({ path: resolve(process.cwd(), '..', 'frontend/admin/store-map-picker.js') });
  await page.evaluate(() => {
    const root = document.querySelector('[data-waternow-store-map-picker]');
    window.__waterNowMapCleanup = window.WaterNowStoreMapPicker.mount(root);
  });
  await page.waitForFunction(() => !!window.__waterNowTestMap);

  const latitude = page.locator('[name="latitude"]');
  const longitude = page.locator('[name="longitude"]');
  const mapCanvas = page.locator('[data-store-map-canvas]');

  await expect(latitude).toHaveValue('');
  await expect(longitude).toHaveValue('');

  // A tap on the map places a marker and writes hidden coordinate fields.
  await mapCanvas.click();
  await expect(latitude).toHaveValue('17.410001');
  await expect(longitude).toHaveValue('78.590002');
  expect(await page.evaluate(() => window.__waterNowTestMarker.options.draggable)).toBe(true);

  // Dragging the marker changes the saved coordinates.
  await page.evaluate(() => {
    window.__waterNowTestMarker.setLatLng([17.415555, 78.595555]);
    window.__waterNowTestMarker.fire('dragend');
  });
  await expect(latitude).toHaveValue('17.415555');
  await expect(longitude).toHaveValue('78.595555');

  // The delivery-radius circle follows changes in the radius field.
  await page.locator('[name="radius"]').fill('7.5');
  await expect.poll(() => page.evaluate(() => window.__waterNowTestCircle.radius)).toBe(7500);

  // Address search is geocoded and selects the returned point.
  await page.locator('[data-map-search-input]').fill('WaterNow, Hyderabad');
  await page.locator('[data-map-search-button]').click();
  await expect(latitude).toHaveValue('17.422222');
  await expect(longitude).toHaveValue('78.544444');
  await expect(page.locator('[data-map-status]')).toContainText('Address found');

  // The owner can choose the browser's current location as a starting pin too.
  await page.locator('[data-map-current-location]').click();
  await expect(latitude).toHaveValue('17.430001');
  await expect(longitude).toHaveValue('78.550002');
  await expect(page.locator('[data-map-status]')).toContainText('Current location selected');

  const submitted = await page.evaluate(() =>
    Object.fromEntries(new FormData(document.querySelector('#storeForm')).entries())
  );
  expect(submitted.latitude).toBe('17.430001');
  expect(submitted.longitude).toBe('78.550002');
  expect(submitted.radius).toBe('7.5');
  expect(pageErrors).toEqual([]);
});
