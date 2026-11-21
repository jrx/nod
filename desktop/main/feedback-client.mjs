export function createStartupFeedbackClient({ fork, file, environment, input }) {
  let current;
  let sequence = 0;

  function stop(state, error) {
    if (state.closed) return;
    state.closed = true;
    clearTimeout(state.timer);
    if (current === state) current = undefined;
    state.rejectStartup(error);
    for (const item of state.pending.values()) item.reject(error);
    state.pending.clear();
    state.child.kill();
  }

  function request(state, action, value) {
    return new Promise((resolve, reject) => {
      if (state.closed) {
        reject(new Error('The report helper stopped before the action started.'));
        return;
      }
      const id = ++sequence;
      const timer = setTimeout(
        () =>
          stop(
            state,
            new Error(
              'The report action did not finish within 100 seconds. Check its status before sending again.',
            ),
          ),
        100_000,
      );
      const item = {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      state.pending.set(id, item);
      try {
        state.child.postMessage({ id, action, input: value });
      } catch (error) {
        stop(state, error);
      }
    });
  }

  function start() {
    const state = {
      child: fork(file, [], { env: environment, stdio: 'ignore', serviceName: 'Nod bug report' }),
      pending: new Map(),
      closed: false,
    };
    current = state;
    const interrupted = new Promise((_, reject) => {
      state.rejectStartup = reject;
    });
    const loaded = new Promise((resolve) => {
      state.child.on('message', (data) => {
        if (state.closed) return;
        if (data.ready) {
          resolve();
          return;
        }
        const item = state.pending.get(data.id);
        if (!item) return;
        state.pending.delete(data.id);
        if (data.error) item.reject(new Error(data.error));
        else item.resolve(data.value);
      });
    }).then(async () => {
      await request(state, 'initialize', await input());
    });
    state.timer = setTimeout(
      () => stop(state, new Error('The report helper did not start within 30 seconds.')),
      30_000,
    );
    state.child.once('exit', () =>
      stop(
        state,
        new Error(
          'The report helper stopped before the action finished. Check the report status before sending again.',
        ),
      ),
    );
    state.child.once('error', (error) => stop(state, error));
    state.ready = Promise.race([loaded, interrupted])
      .then(() => {
        clearTimeout(state.timer);
      })
      .catch((error) => {
        stop(state, error);
        throw error;
      });
    return state;
  }

  return {
    async request(action, value) {
      const state = current ?? start();
      await state.ready;
      return request(state, action, value);
    },
    close() {
      if (current)
        stop(
          current,
          new Error(
            'The report helper stopped before the action finished. Check the report status before sending again.',
          ),
        );
    },
  };
}
