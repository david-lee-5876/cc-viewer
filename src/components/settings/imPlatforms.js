// Single source of truth for the IM platforms the messaging UI knows about: brand icon/color,
// tab label, backend endpoints, and the per-platform settings-form field spec. The messaging
// modal, the header status chips, and the chat IM-source badge all derive from this registry, so
// adding a platform is one entry here (+ an icon + i18n keys).
import DingTalkIcon from '../common/DingTalkIcon';
import FeishuIcon from '../common/FeishuIcon';
import WeComIcon from '../common/WeComIcon';
import DiscordIcon from '../common/DiscordIcon';

export const dingtalkDescriptor = {
  id: 'dingtalk',
  labelKey: 'ui.messaging.dingtalk',
  fallback: 'DingTalk',
  icon: DingTalkIcon,
  color: '#1677ff',
  endpoints: { status: '/api/im/dingtalk/status', config: '/api/im/dingtalk/config', test: '/api/im/dingtalk/test' },
  enable: { key: 'ui.dingtalk.enable', fallback: 'Enable DingTalk bridge' },
  fields: [
    { key: 'appKey', type: 'text', section: 'main', required: true, labelKey: 'ui.dingtalk.appKey', fallback: 'AppKey' },
    { key: 'appSecret', type: 'password', section: 'main', required: true, labelKey: 'ui.dingtalk.appSecret', fallback: 'AppSecret' },
    {
      key: 'allowStaffIds', type: 'tags', section: 'more', optional: true,
      labelKey: 'ui.dingtalk.allowStaff', fallback: 'Sender allowlist (staffId)',
      placeholderKey: 'ui.dingtalk.allowStaffPlaceholder', placeholderFallback: 'staffId, press Enter to add',
    },
    {
      key: 'blockOnSkipPermissions', type: 'switch', section: 'more',
      labelKey: 'ui.dingtalk.blockSkipPerm', fallback: 'Block injection in skip-permissions sessions',
      helpKey: 'ui.dingtalk.blockSkipPermHelp', helpFallback: 'When the Claude session runs with --dangerously-skip-permissions, refuse remote injection (which would execute with no approval).',
    },
  ],
  notes: [
    { kind: 'warn', key: 'ui.dingtalk.securityWarn', fallback: '⚠️ DingTalk messages directly drive the local session (which can run commands). Enable only for trusted members.' },
    { kind: 'hint', key: 'ui.dingtalk.singleKeyHint', fallback: 'Do not connect the same AppKey from multiple programs — use a dedicated DingTalk app for cc-viewer.' },
    { kind: 'hint', key: 'ui.dingtalk.replyDelayHint', fallback: 'Replies arrive ~10s after the turn completes.' },
  ],
};

export const feishuDescriptor = {
  id: 'feishu',
  labelKey: 'ui.messaging.feishu',
  fallback: 'Feishu',
  icon: FeishuIcon,
  color: '#00d6b9',
  endpoints: { status: '/api/im/feishu/status', config: '/api/im/feishu/config', test: '/api/im/feishu/test' },
  enable: { key: 'ui.feishu.enable', fallback: 'Enable Feishu/Lark bridge' },
  fields: [
    { key: 'appId', type: 'text', section: 'main', required: true, labelKey: 'ui.feishu.appId', fallback: 'App ID' },
    { key: 'appSecret', type: 'password', section: 'main', required: true, labelKey: 'ui.feishu.appSecret', fallback: 'App Secret' },
    {
      key: 'region', type: 'select', section: 'main', default: 'feishu',
      labelKey: 'ui.feishu.region', fallback: 'Region',
      options: [
        { value: 'feishu', labelKey: 'ui.feishu.regionCn', fallback: 'Feishu (feishu.cn)' },
        { value: 'lark', labelKey: 'ui.feishu.regionGlobal', fallback: 'Lark (larksuite.com)' },
      ],
    },
    {
      key: 'allowUserIds', type: 'tags', section: 'more', optional: true,
      labelKey: 'ui.feishu.allowUsers', fallback: 'Sender allowlist (open_id)',
      placeholderKey: 'ui.feishu.allowUsersPlaceholder', placeholderFallback: 'open_id, press Enter to add',
    },
    {
      key: 'blockOnSkipPermissions', type: 'switch', section: 'more',
      labelKey: 'ui.im.blockSkipPerm', fallback: 'Block injection in skip-permissions sessions',
      helpKey: 'ui.im.blockSkipPermHelp', helpFallback: 'When the Claude session runs with --dangerously-skip-permissions, refuse remote injection (which would execute with no approval).',
    },
  ],
  notes: [
    { kind: 'hint', key: 'ui.feishu.provisioningHelp', fallback: 'In the Feishu/Lark console: create a custom app, set Event Subscription to long-connection, subscribe im.message.receive_v1, grant the im:message scope, publish the app, then add the bot to a chat.' },
    { kind: 'warn', key: 'ui.im.securityWarn', fallback: '⚠️ Incoming messages directly drive the local session.' },
    { kind: 'hint', key: 'ui.feishu.replyDelayHint', fallback: 'Replies arrive ~10s after the turn completes.' },
  ],
};

export const wecomDescriptor = {
  id: 'wecom',
  labelKey: 'ui.messaging.wecom',
  fallback: 'WeCom',
  icon: WeComIcon,
  color: '#2f90e8',
  endpoints: { status: '/api/im/wecom/status', config: '/api/im/wecom/config', test: '/api/im/wecom/test' },
  enable: { key: 'ui.wecom.enable', fallback: 'Enable WeCom bridge' },
  fields: [
    { key: 'botId', type: 'text', section: 'main', required: true, labelKey: 'ui.wecom.botId', fallback: 'Bot ID' },
    { key: 'secret', type: 'password', section: 'main', required: true, labelKey: 'ui.wecom.secret', fallback: 'Secret' },
    {
      key: 'allowUserIds', type: 'tags', section: 'more', optional: true,
      labelKey: 'ui.wecom.allowUsers', fallback: 'Sender allowlist (userid)',
      placeholderKey: 'ui.wecom.allowUsersPlaceholder', placeholderFallback: 'userid, press Enter to add',
    },
    {
      key: 'blockOnSkipPermissions', type: 'switch', section: 'more',
      labelKey: 'ui.im.blockSkipPerm', fallback: 'Block injection in skip-permissions sessions',
      helpKey: 'ui.im.blockSkipPermHelp', helpFallback: 'When the Claude session runs with --dangerously-skip-permissions, refuse remote injection (which would execute with no approval).',
    },
  ],
  notes: [
    { kind: 'hint', key: 'ui.wecom.provisioningHelp', fallback: 'In the WeCom console: create a Smart Robot, set its API receive mode to long-connection, copy the Bot ID + Secret, then add the bot to a chat.' },
    { kind: 'warn', key: 'ui.im.securityWarn', fallback: '⚠️ Incoming messages directly drive the local session.' },
    { kind: 'hint', key: 'ui.wecom.replyDelayHint', fallback: 'Replies arrive ~10s after the turn completes.' },
  ],
};

export const discordDescriptor = {
  id: 'discord',
  labelKey: 'ui.messaging.discord',
  fallback: 'Discord',
  icon: DiscordIcon,
  color: '#5865F2',
  endpoints: { status: '/api/im/discord/status', config: '/api/im/discord/config', test: '/api/im/discord/test' },
  enable: { key: 'ui.discord.enable', fallback: 'Enable Discord bridge' },
  fields: [
    { key: 'botToken', type: 'password', section: 'main', required: true, labelKey: 'ui.discord.botToken', fallback: 'Bot Token' },
    {
      key: 'allowUserIds', type: 'tags', section: 'more', optional: true,
      labelKey: 'ui.discord.allowUsers', fallback: 'Sender allowlist (user ID)',
      placeholderKey: 'ui.discord.allowUsersPlaceholder', placeholderFallback: 'user ID, press Enter to add',
    },
    {
      key: 'blockOnSkipPermissions', type: 'switch', section: 'more',
      labelKey: 'ui.im.blockSkipPerm', fallback: 'Block injection in skip-permissions sessions',
      helpKey: 'ui.im.blockSkipPermHelp', helpFallback: 'When the Claude session runs with --dangerously-skip-permissions, refuse remote injection (which would execute with no approval).',
    },
  ],
  notes: [
    { kind: 'hint', key: 'ui.discord.provisioningHelp', fallback: 'In the Discord Developer Portal: create an app + bot, ENABLE the Message Content Intent, copy the bot token, and invite the bot (scopes: bot + applications.commands) with View Channels / Send Messages.' },
    { kind: 'warn', key: 'ui.im.securityWarn', fallback: '⚠️ Incoming messages directly drive the local session.' },
    { kind: 'hint', key: 'ui.discord.replyDelayHint', fallback: 'Replies arrive ~10s after the turn completes. In a server channel the bot replies to every message — set a sender allowlist.' },
  ],
};

export const IM_PLATFORMS = [dingtalkDescriptor, feishuDescriptor, wecomDescriptor, discordDescriptor];

// Brand icon + color per id, for the chat IM-source badge (⟦im:<id>⟧).
export const IM_SOURCE_ICONS = Object.fromEntries(
  IM_PLATFORMS.map((p) => [p.id, { Icon: p.icon, color: p.color }]),
);
