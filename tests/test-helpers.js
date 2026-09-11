function createMemoryStorage(initial = {}) {
  const data = structuredClone(initial);
  return {
    async get(key) { return { [key]: structuredClone(data[key]) }; },
    async set(values) { Object.assign(data, structuredClone(values)); },
  };
}

module.exports = { createMemoryStorage };
