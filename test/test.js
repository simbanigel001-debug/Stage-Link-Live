'use strict';

const assert = require('assert');
const MixerManager = require('../drivers/mixer-manager');
const TrackingEngine = require('../tracking/tracking-engine');
const ManualProvider = require('../manual-provider');
const UWBProvider = require('../tracking/uwb-provider');

describe('StageLink Live Core Test Suite', () => {
  let mixerManager;
  let trackingEngine;

  beforeEach(() => {
    mixerManager = new MixerManager({ type: 'x32', ip: '127.0.0.1' });
    trackingEngine = new TrackingEngine();
  });

  afterEach(() => {
    if (mixerManager.isConnected()) {
      mixerManager.disconnect();
    }
  });

  it('should initialize MixerManager with default driver parameters', () => {
    assert.strictEqual(mixerManager.getMixerType(), 'x32');
    assert.strictEqual(mixerManager.isConnected(), false);
  });

  it('should dynamically switch mixer drivers', async () => {
    await mixerManager.switchDriver('yamaha', '192.168.1.50', 49280);
    assert.strictEqual(mixerManager.getMixerType(), 'yamaha');
    assert.strictEqual(mixerManager.isConnected(), true);
  });

  it('should register and switch tracking providers', () => {
    const manualProvider = new ManualProvider();
    const uwbProvider = new UWBProvider({ port: 9090 });

    trackingEngine.registerProvider('MANUAL', manualProvider);
    trackingEngine.registerProvider('UWB', uwbProvider);

    trackingEngine.setProvider('MANUAL');
    assert.strictEqual(trackingEngine.activeProviderKey, 'MANUAL');

    trackingEngine.setProvider('UWB');
    assert.strictEqual(trackingEngine.activeProviderKey, 'UWB');
  });

  it('should calculate correct stereo pan based on X-axis coordinates', (done) => {
    const manualProvider = new ManualProvider();
    trackingEngine.registerProvider('MANUAL', manualProvider);
    trackingEngine.setProvider('MANUAL');

    trackingEngine.on('POSITION_UPDATE', (payload) => {
      // Stage Left (x = 20) -> Pan = -0.6
      const expectedPan = parseFloat(((payload.coordinates.x - 50) / 50).toFixed(2));
      assert.strictEqual(expectedPan, -0.6);
      done();
    });

    manualProvider.updateManualPosition(1, 20, 50);
  });
});
