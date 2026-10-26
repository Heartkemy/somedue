// Isolated UI test fixture. Inject into an isolated Playwright browser session.
// It does not ship with the app and never contacts native storage or Things Cloud.
(() => {
  const state = {entities: [], account: 'local', pending: 0, blocked: false, lastSync: null, preferences: {motion: false}};
  window.__TEST_STATE__ = state;
  window.__TEST_FAIL__ = false;
  window.__TAURI_INTERNALS__ = {invoke: async (command, args = {}) => {
    if (window.__TEST_FAIL__) throw Error('Synthetic disk failure: your changes were not saved.');
    if (command === 'mutate') {
      for (const [id, event] of Object.entries(args.changes)) {
        const old = state.entities.find(e => e.id === id);
        if (event.t === 2) { state.entities = state.entities.filter(e => e.id !== id); continue; }
        const props = {...(old?.props || {}), ...event.p};
        if (typeof props.nt === 'string') props.nt = {v: props.nt};
        if (old) old.props = props; else state.entities.push({id, kind: event.e, props});
      }
    } else if (command === 'preferences') { state.preferences = args.value; return; }
    else if (!['load', 'sync'].includes(command)) throw Error('This fixture does not implement ' + command);
    return structuredClone(state);
  }};
  return 'Frontend fixture ready; all data is isolated in browser memory.';
})();
