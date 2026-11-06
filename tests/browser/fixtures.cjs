const note = { id: 'one', serial: 'X00000000002', printerCode: 'R001A1', denomination: '20', country: 'Slovakia', city: 'Bratislava', postalCode: '', comment: '', createdAt: '2026-11-06' };
async function setup(page, { notes = [], signedIn = false, preferences = {} } = {}) {
  await page.route('**/api/ebt/**', async route => {
    if (route.request().url().endsWith('/session')) return route.fulfill({ json: { account: signedIn ? { username: 'TestTracker', totalbills: 1, totalhits: 0, my_country: '', my_city: '', my_zip: '' } : null } });
    return route.fulfill({ json: { data: [] } });
  });
  await page.addInitScript(({ notes, preferences }) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('ebt-web-queue', JSON.stringify(notes));
      for (const [key, value] of Object.entries(preferences)) localStorage.setItem(key, value);
      sessionStorage.setItem('seeded', 'true');
    }
    window.cameraRequests = 0;
    window.cameraStops = 0;
    window.ocrItems = [];
    window.ocrPredictions = 0;
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.cameraRequests++;
      const stream = await getUserMedia(constraints);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { window.cameraStops++; stop(); };
      }
      return stream;
    };
    // Mock the SDK worker protocol, while exercising the real SDK and app pipeline.
    window.Worker = class {
      postMessage(message) {
        let payload;
        if (message.type === 'init') payload = { summary: { ready: true }, modelConfig: {} };
        else if (message.type === 'predict') {
          window.ocrPredictions++;
          window.lastOcrSources = message.payload.sources;
          payload = [{ items: window.ocrItems }];
        } else payload = {};
        queueMicrotask(() => this.onmessage?.({ data: { kind: 'worker-transport-response', requestId: message.requestId, status: 'success', payload } }));
      }
      terminate() {}
    };
  }, { notes, preferences });
}
module.exports = { setup, note };
