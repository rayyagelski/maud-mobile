import { createMigrate } from 'redux-persist';
import { PERSIST_VERSION, persistMigrations } from '../src/store/persistMigrations';
import settingsReducer from '../src/store/slices/settingsSlice';
import complianceReducer from '../src/store/slices/complianceSlice';

const migrate = createMigrate(persistMigrations, { debug: false });

// A saved state from before versioning (redux-persist stores version -1).
const saved = () => ({
  _persist: { version: -1, rehydrated: false },
  settings: {
    autoPlayTripSummaryVoice: false, driveFocusReminderEnabled: true, locationOnboardingComplete: true,
    defaultTripType: 'business',
  },
  compliance: { alertsEnabled: false, other: 'kept' },
  trips: { trips: [{ id: 't1' }] },
  vehicles: { list: ['v1'] },
});

describe('saved-state migration: new defaults for existing installs', () => {
  it('applies auto-play ON, Focus reminder OFF, Speed Zone alerts ON — once', async () => {
    const out = await migrate(saved() as never, PERSIST_VERSION) as unknown as ReturnType<typeof saved>;
    expect(out.settings).toEqual({
      autoPlayTripSummaryVoice: true, driveFocusReminderEnabled: false, locationOnboardingComplete: true,
      defaultTripType: 'business',
    });
    expect(out.compliance).toEqual({ alertsEnabled: true, other: 'kept' });
  });

  it('keeps everything else exactly as it was (trips, vehicles, …)', async () => {
    const before = saved();
    const out = await migrate(before as never, PERSIST_VERSION) as unknown as ReturnType<typeof saved>;
    expect(out.trips).toBe(before.trips);
    expect(out.vehicles).toBe(before.vehicles);
  });

  it('does not run again: a driver who changes the settings afterwards keeps them', async () => {
    const already = { ...saved(), _persist: { version: PERSIST_VERSION, rehydrated: false } };
    const out = await migrate(already as never, PERSIST_VERSION) as unknown as ReturnType<typeof saved>;
    expect(out.settings.autoPlayTripSummaryVoice).toBe(false);
    expect(out.settings.driveFocusReminderEnabled).toBe(true);
    expect(out.compliance.alertsEnabled).toBe(false);
  });

  it('handles a fresh install (nothing saved) and partial saved states', async () => {
    await expect(migrate(undefined as never, PERSIST_VERSION)).resolves.toBeUndefined();
    const partial = { _persist: { version: -1, rehydrated: false }, trips: { trips: [] } };
    const out = await migrate(partial as never, PERSIST_VERSION) as unknown as Record<string, unknown>;
    expect(out).toEqual({ ...partial, _persist: partial._persist });
    expect('settings' in out).toBe(false);
  });

  it('fresh installs start with the new defaults', () => {
    const settings = settingsReducer(undefined, { type: '@@init' });
    expect(settings.autoPlayTripSummaryVoice).toBe(true);
    expect(settings.driveFocusReminderEnabled).toBe(false);
    expect(complianceReducer(undefined, { type: '@@init' }).alertsEnabled).toBe(true);
  });
});
