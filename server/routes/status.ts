export interface PluginStatus {
  module: string;
  status: 'operational';
  timestamp: string;
}

export function pluginStatus(now = new Date()): PluginStatus {
  return { module: 'blit', status: 'operational', timestamp: now.toISOString() };
}
