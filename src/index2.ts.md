import { Context, h, Schema } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import fs from 'node:fs'
import path from 'node:path'
export const inject = {
  required: ["puppeteer", "http", "i18n"]
}

export const name = 'qwq-mc-ament'


export const Config = Schema.intersect([
  Schema.object({
    amentCommand: Schema.string().default("ament").description("命令名称"),
    ament_title: Schema.string().default("整装上阵").description("成就标题"),
    ament_description: Schema.string().default("你好，qwq").description("成就描述"),
  }).description('基础设置'),
  Schema.object({
    promptTimeout: Schema.number().default(30).description("等待用户输入图片的超时时间（秒）"),
    usedavatar: Schema.boolean().default(true).description("`超时未输入图片` 或 `没有引用图片`的时候，默认使用用户头像"),
  }).description('进阶设置'),
  Schema.object({
    fontPath: Schema.string().default(path.join(__dirname, 'assets', 'Minecraft_AE.ttf')).description("使用的字体文件的绝对路径"),
    backgroundPath: Schema.string().default(path.join(__dirname, 'assets', 'AdvancementMade_BG.png')).description("使用的背景图文件的绝对路径"),
    screenshotquality: Schema.number().role('slider').min(0).max(100).step(1).default(60).description('设置图片压缩质量（%）'),
  }).description('渲染设置'),

  Schema.object({
    loggerinfo: Schema.boolean().default(false).description("是否开启日志调试模式<br>一般不需要开启"),
    pageclose: Schema.boolean().default(true).description("浏览器有头调试模式<br>非开发者请勿关闭"),
  }).description('开发者设置'),
])

export function apply(ctx: Context, config) {
  ctx.i18n.define("zh-CN", {
    commands: {
      [config.amentCommand]: {
        arguments: {
          ament_icon: "成就图标",
        },
        description: "生成一个MC风格的成就图片",
        messages: {
        },
        options: {
          ament_title: "成就标题",
          ament_description: "成就描述",
        }
      },
    }
  });
  ctx.command(`${config.amentCommand} [ament_icon:image]`)
    .option("ament_title", '-t, --ament_title <ament_title:string>', { fallback: config.ament_title })
    .option("ament_description", '-d, --ament_description <ament_description:string>', { fallback: config.ament_description })
    .action(async ({ session, options }, ament_icon) => {
      let quoteMessage: string;
      if (session.quote) {

        /*
        由于 adapter-onebot 的特性，会把回复的那个图片作为此次输入的内容的末尾。
        所以这里需要将其去掉。
        
        1. 可以直接移除掉尖括号内的输入。比如忽略掉<image>

        2.  或者 考虑将 【ament_title】和【ament_description】改为使用选项输入

        3. 可以只使用用户头像作为成就图标

        ---

        这里考虑直接【 2.  或者 考虑将 【ament_title】和【ament_description】改为使用选项输入】
        */

        quoteMessage = session.quote?.content
        logInfo("引用的消息内容：", session.quote?.content);
      } else {
        logInfo("等待用户输入...");
        await session.send("请发送图片消息：");
        quoteMessage = await session.prompt(config.promptTimeout * 1000) // ms
        if (!quoteMessage) {
          quoteMessage = session.event.user.avatar
        }
      }
      logInfo(options.ament_title)
      logInfo(options.ament_description)
      const ament_icon_url = extractFirstImageUrl(quoteMessage);

      logInfo("ICON链接：", ament_icon_url);
      const imagebuffer = await ctx.http.file(ament_icon_url);
      if (!imagebuffer) {
        await session.send("图片访问失败！");
        return '图片访问失败！'
      };
      logInfo(imagebuffer)
      /*在这里的【ament_icon_url】打印出来的内容是这样的
      ```
      2025-03-15 17:53:21 [I] qwq-mc-ament { type: 'image/jpeg', mime: 'image/jpeg', filename: 'download', data: ArrayBuffer { [Uint8Contents]: <ff 05 04 05 ... 85468 more bytes>, byteLength: 85568 } }
      ```
      我们可以直接把这个处理为base64内容以供Puppeteer渲染使用：
      */
      const backgroundPathbase64 = await ctx.http.file(config.backgroundPath)
      const fontPathbase64 = await ctx.http.file(config.fontPath)
      /*
      这里打印的【ctx.http.file】内容与上方一致
      我们可以考虑提取一个函数实现复用。就叫filetobase64吧，但是是使用ctx.http.file实现的
       */

      try {
        const page = await ctx.puppeteer.page();
        const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <style>
              @font-face {
                  font-family: 'Minecraft';
                  src: url(data:font/truetype;charset=utf-8;base64,${backgroundPathbase64}) format('truetype');
              }
              <!-- 后续这里的"width: 320px; height: 64px;"需要使用ctx.canvas来实现动态调整。这样可以自定义背景图了-->
              body {
                  margin: 0;
                  width: 320px;
                  height: 64px;
                  background: url(data:image/png;base64,${fontPathbase64}}) no-repeat;
                  background-size: 100% 100%;  
                  background-color: transparent; /* 确保背景色为透明 */
                  display: flex;
                  flex-direction: row; /* 横向排列 */
                  align-items: center; /* 垂直居中 */
                  padding: 20px 30px 20px 30px;
                  box-sizing: border-box;
              }
      
              .icon {
                  width: 200px;
                  height: 200px;
                  margin-right: 40px;
                  ${ament_icon_url.startsWith('#') ? `background: ${ament_icon_url}` : `background: url(${ament_icon_url})`};
                  background-size: contain;
              }
      
              .text-container {
                  flex: 1;
                  color: #FFFFFF;
                  font-family: 'Minecraft', sans-serif;
                  text-shadow: 2px 2px #3F3F3F;
                  display: flex;
                  flex-direction: column;
                  justify-content: space-between; /* 上下排列，确保 title 和 description 分开 */
                  height: 81%; /* 确保内容撑满 */
                  align-items: flex-end; /* 右对齐 */
              }
      
              .title {
                  font-size: 72px;
                  margin-bottom: 0;
                  color: #FCFC00;
                  align-self: flex-start; /* 右上角 */
              }
      
              .description {
                  font-size: 72px;
                  opacity: 0.8;
                  align-self: flex-start; /* 右下角 */
              }
          </style>
      </head>
      <body>
          <div class="icon"></div>
          <div class="text-container">
              <div class="title">${options.ament_title}</div>
              <div class="description">${options.ament_description}</div>
          </div>
      </body>
      </html>`;

        // 4. 将 HTML 加载到浏览器页面
        await page.setContent(html);
        await page.waitForNetworkIdle();// 等待网络空闲
        /**
            await page.waitForNetworkIdle();
            const element = await page.$('body');
  
            imageBuffer = await element.screenshot({
              type: "jpeg",  // 使用 JPEG 格式
              encoding: "binary",
              quality: config.screenshotquality  // 设置图片质量
            });
  
         */
        await session.send(h.image(imageBuffer));
        return

      } catch (error) {
        ctx.logger.error("渲染失败：", error)
      }
    }
    )

  function logInfo(...args: any[]) {
    if (config.loggerinfo) {
      (ctx.logger.info as (...args: any[]) => void)(...args);
    }
  }

  const extractFirstImageUrl = (content) => {
    let urls = h.select(content, 'img').map(item => item.attrs.src);
    if (urls?.length > 0)
      return urls[0];

    urls = h.select(content, 'mface').map(item => item.attrs.url);
    return urls?.length > 0 ? urls[0] : null;
  };
}



