(function exposeProviderPresets(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.XhsProviderPresets = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createProviderPresets() {
  const PRESETS = [
    {
      id: 'deepseek',
      label: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
    },
    {
      id: 'aliyun',
      label: '阿里云百炼',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-plus',
    },
    {
      id: 'openai',
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5-mini',
    },
    {
      id: 'moonshot',
      label: 'Moonshot / Kimi',
      baseUrl: 'https://api.moonshot.cn/v1',
      model: 'kimi-k2.5',
    },
    {
      id: 'siliconflow',
      label: 'SiliconFlow 硅基流动',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'Qwen/Qwen3-8B',
    },
    {
      id: 'custom',
      label: '自定义兼容服务',
      baseUrl: '',
      model: '',
    },
  ];

  function normalizeUrl(value) {
    return typeof value === 'string' ? value.trim().replace(/\/+$/, '').toLowerCase() : '';
  }

  function clonePreset(preset) {
    return preset ? { ...preset } : null;
  }

  function listProviderPresets() {
    return PRESETS.map(clonePreset);
  }

  function getProviderPreset(id) {
    return clonePreset(PRESETS.find((preset) => preset.id === id));
  }

  function inferProviderId(baseUrl) {
    const normalized = normalizeUrl(baseUrl);
    const match = PRESETS.find((preset) => preset.id !== 'custom'
      && normalizeUrl(preset.baseUrl) === normalized);
    return match ? match.id : 'custom';
  }

  return {
    getProviderPreset,
    inferProviderId,
    listProviderPresets,
  };
}));
