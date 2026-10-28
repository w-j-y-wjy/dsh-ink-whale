/**
 * dsh-ink-whale — Host 半。
 *
 * 这里做三件事：
 *   1. 声明插件配置；
 *   2. 告诉 Settings 服务「本插件自带设置页，不要生成自动表单」；
 *   3. 往 index.html 的 <head> 里注入一小段首屏遮罩：官方 boot 卡换成主界面、
 *      而浏览器半的开屏还没挂上的那一小段空档，先用开屏底色盖住，避免主界面
 *      闪一下。浏览器半画出第一帧后会把它摘掉。
 *
 * 配置是 `.volatile()` 的：Settings 的配置表单只投影 volatile 字段，且写入
 * 会即时重新解析，所以浏览器半在设置里改完字体 / 文字 / 深浅后，下一次开屏
 * 立刻使用新值，不需要重启 dsh。
 */
import z from '@deepseek-ai/schemastery';

/** Loader 条目名；必须与 cordis.patch.yml 里的 name 和浏览器半的 id 一致。 */
export const name = 'dsh-ink-whale';

/**
 * 本插件在 profile 里的 Loader 条目 id。
 *
 * Settings 文档按「profile 条目 id」寻址，浏览器半要用同一个 id 去取表单；
 * 从 bundle 挂载时实际 id 可能是 `include:ink-whale`，浏览器半两种都试。
 */
export const INK_WHALE_ENTRY_ID = 'ink-whale';

/** 浏览器半缓存配置用的 localStorage key（首屏遮罩也要读它）。 */
export const CONFIG_STORAGE_KEY = 'dsh-ink-whale:config';

/** 内嵌的 8 套手写笔画字体。 */
export const FONT_KEYS = [
  'caveat',
  'tangerine',
  'italianno',
  'parisienne',
  'ems-allure',
  'hershey-script',
  'nanum-pen-script',
  'klee-one'
];

/** 深浅色策略：auto 跟随 DSH 主题。 */
export const THEME_KEYS = ['auto', 'dark', 'light'];

/** 手写播放倍速：写完之后按这个倍数压缩整段开屏时长。 */
export const SPEED_KEYS = [0.5, 1, 1.5, 2, 3];

/**
 * 插件配置。
 *
 * 每个字段都带默认值：patch 条目里的 `config` 是整段替换而不是深合并，
 * 所以默认值必须写在这里，缺失字段才能落回合理值。
 */
export const Config = z
  .object({
    enabled: z.boolean().default(true).description('启动时播放开屏'),
    font: z
      .union(FONT_KEYS.map((key) => z.const(key)))
      .default('caveat')
      .description('手写字体：caveat / tangerine / italianno / parisienne / ems-allure / hershey-script / nanum-pen-script / klee-one'),
    name: z.string().default('DeepSeek').description('写出来的称呼'),
    greeting: z.string().default('{name}').description('问候语模板，{name} 会替换为称呼'),
    caption: z.string().default('探索未至之境').description('鲸鱼锁标下方的副标题，留空则不显示'),
    theme: z
      .union(THEME_KEYS.map((key) => z.const(key)))
      .default('auto')
      .description('深浅色：auto 跟随 DSH 主题'),
    skipWhale: z.boolean().default(false).description('关闭后续鲸鱼动画：写完字直接淡出进入主界面'),
    speed: z
      .union(SPEED_KEYS.map((key) => z.const(key)))
      .default(1)
      .description('手写播放倍速：0.5 / 1 / 1.5 / 2 / 3')
  })
  .volatile();

/**
 * 首屏遮罩：官方 boot 卡退场、浏览器半开屏挂上之前的空档用它盖住。
 *
 * 为什么不在浏览器半做：那段空档发生在浏览器半加载之前，只有宿主注入的
 * 同步脚本赶得上。这里用 webserver/index-inject 的结构化行（style + head script）：
 * 桌面端把这张表随 boot payload 一起送进渲染进程、在挂载应用之前执行，
 * 浏览器端由 renderIndex 直接写进 index.html——两端都赶得上。
 *
 * 脚本只做两件事：
 *   1. 用 MutationObserver 盯住 AppFrame（[data-shell-overlay]）出现的瞬间，
 *      在它第一次绘制之前把遮罩插进 body（DOM 变更回调早于绘制）；
 *   2. 把摘遮罩的句柄挂到 window.__dshiwBootCover，浏览器半画完第一帧就调用。
 * 遮罩底色取 body 的计算样式，与 boot 卡同色，所以 boot 卡 → 遮罩 → 开屏
 * 是同一个底色。缓存里 enabled:false（用户关掉开屏）时完全不遮；
 * 8 秒兜底自动摘掉，避免插件出错时一直黑屏。
 */
export const BOOT_COVER_STYLE = '#dshiw-boot-cover{position:fixed;inset:0;z-index:2147482900}';

export const BOOT_COVER_SCRIPT =
  '(function(){' +
  'if(window.__dshiwBootCover)return;' +
  'var KEY="' + CONFIG_STORAGE_KEY + '";' +
  'var done=false,cover=null,mo=null,timer=0;' +
  'function wanted(){' +
  'try{var raw=window.localStorage.getItem(KEY);' +
  'if(raw){var cfg=JSON.parse(raw);if(cfg&&cfg.enabled===false)return false;}}catch(e){}' +
  'return true;' +
  '}' +
  'function bgColor(){' +
  'try{var c=getComputedStyle(document.body).backgroundColor;' +
  'if(c&&c!=="rgba(0, 0, 0, 0)"&&c!=="transparent")return c;}catch(e){}' +
  'try{return window.matchMedia("(prefers-color-scheme: dark)").matches?"#000":"#fff";}catch(e){return "#000";}' +
  '}' +
  'function show(){' +
  'if(done||cover||!wanted()||!document.body)return;' +
  'cover=document.createElement("div");' +
  'cover.id="dshiw-boot-cover";' +
  'cover.setAttribute("aria-hidden","true");' +
  'cover.style.background=bgColor();' +
  'document.body.appendChild(cover);' +
  '}' +
  'function drop(){' +
  'done=true;' +
  'if(timer){clearTimeout(timer);timer=0;}' +
  'stop();' +
  'if(cover&&cover.parentNode)cover.parentNode.removeChild(cover);' +
  'cover=null;' +
  '}' +
  'function stop(){if(mo){mo.disconnect();mo=null;}}' +
  'function check(){' +
  'if(document.querySelector("[data-shell-overlay]")){stop();show();}' +
  '}' +
  /* 只在本次新增的子树里找 [data-shell-overlay]，不再每次回调都对整份文档做全树查询。
     启动期应用会插入几百次节点，旧实现每次回调 document.querySelector 扫全树
     （实测 347 次回调 / 214ms）；新增节点通常 1~3 个，扫描量降到常数级。 */
  'function hits(node){' +
  'if(!node||node.nodeType!==1)return false;' +
  'if(node.hasAttribute&&node.hasAttribute("data-shell-overlay"))return true;' +
  'return !!(node.querySelector&&node.querySelector("[data-shell-overlay]"));' +
  '}' +
  'function onMutate(records){' +
  'if(done||cover)return;' +
  'for(var i=0;i<records.length;i++){' +
  'var added=records[i].addedNodes;' +
  'for(var j=0;j<added.length;j++){' +
  'if(hits(added[j])){stop();show();return;}' +
  '}' +
  '}' +
  '}' +
  'if(wanted()){' +
  'mo=new MutationObserver(onMutate);' +
  'mo.observe(document.documentElement,{childList:true,subtree:true});' +
  'check();' +
  'timer=setTimeout(drop,8000);' +
  'window.__dshiwBootCover={drop:drop};' +
  '}' +
  '})();';

/** webserver/index-inject 的两行；每次 emit 现取，不长期持有。 */
export function bootCoverRows() {
  return [
    { kind: 'style', text: BOOT_COVER_STYLE },
    { kind: 'script', placement: 'head', text: BOOT_COVER_SCRIPT }
  ];
}

/**
 * 挂载 Host 半。
 *
 * 本插件没有工具，也不读配置；它只需要 Settings 知道「自动表单关掉」，
 * 以及 WebServer 允许往 index 里注入首屏遮罩。两者都是可选注入：
 * 缺哪个都不会让插件挂掉。
 */
export function apply(ctx) {
  ctx.inject(['settings'], (settingsCtx) => {
    const settings = settingsCtx.settings;
    if (!settings || typeof settings.configure !== 'function') return;
    settingsCtx.effect(
      () => settings.configure({ auto: false }, ctx.fiber),
      'dsh-ink-whale: own settings page'
    );
  });

  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx.webServer) return;
    webCtx.effect(
      () => webCtx.on('webserver/index-inject', (table) => {
        if (!Array.isArray(table)) return;
        const rows = bootCoverRows();
        for (let i = 0; i < rows.length; i++) table.push(rows[i]);
      }),
      'dsh-ink-whale: boot cover'
    );
  });
}

export default { name, Config, apply };
