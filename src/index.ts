// index.ts
import { Context, Schema, h } from 'koishi'
import { readFileSync } from 'fs';
import path from 'node:path';
import { renderAmentImage } from './generate_image'
import { readFile } from 'fs/promises';

export const name = 'koishi=plugin-qwq-mc-ament'

export const inject = {
    required: ["puppeteer", "http", "i18n"]
}

// export interface Config { }

export const Config = Schema.intersect(
    [
        Schema.object(
            {
                fontPath: Schema.string().default(path.join(__dirname, './../assets/AdvancementMade_BG.png')).description("字体文件绝对路径"),
                bgPath: Schema.string().default(path.join(__dirname, './../assets/AdvancementMade_BG.png')).description("背景图绝对路径"),
            }
        ).description("Assets-静态资源资产相关"),
        Schema.object(
            {
                VerboseLoggerMode: Schema.boolean().default(false).description("是否开启详细输出")
            }
        )
    ]
)

export function apply(ctx: Context, config) {
    // ctx.command('ament [arg0_title:string] [arg1_description:string]')
    // .action(async ({ session, options }, arg0_title, arg1_description) => {
    ctx.command('ament')
        .option("arg0_title", '-t, --title <arg0_title:string>', { fallback: "请输入标题" })
        .option("arg1_description", '-d, --description <arg1_description:string>', { fallback: "请输入描述" })
        .option("arg2_icon", '-i, --icon <arg2_icon:image>')

        .action(async ({ session, options }) => {
            let icon_format;
            const ament_title = options.arg0_title;
            const ament_description = options.arg1_description;
            // const ament_icon = options.arg2_icon;

            let ament_icon; //可能是一个url，也可能是一个base64字符串
            if (options.arg2_icon) {
                icon_format = "url";
                ament_icon = options.arg2_icon.src;
                if (config.VerboseLoggerMode)
                    logInfo(`用户传了icon，ament_icon = options.arg2_icon.src, 即：${ament_icon}`)
            } else {
                icon_format = "base64";
                const fallback_img_path = path.join(__dirname, 'assets', 'fallback_icon.jpg');
                const fallback_base64_str = readFileSync(fallback_img_path).toString('base64');
                ament_icon = `data:image/jpeg;base64,${fallback_base64_str}`;
                if (config.VerboseLoggerMode)
                    logInfo(`用户没有传icon，ament_icon fallback至静态资源，base64编码： ${ament_icon.slice(0, 50)}...`)
            }
            //上面是处理icon的fallback逻辑


            await session.send(`[debug]ament_title = ${ament_title}, ament_desc = ${ament_description}, ament_icon = ` + h.image(ament_icon));
            if (session.quote) {
                logInfo("has quote");
            } else {
                logInfo("no quote");
            }
            if (config.VerboseLoggerMode) {
                if (icon_format === "url") //ament_icon是url字符串
                    await session.send(`[debug]ament_icon_url = ${ament_icon}`);
                else if (icon_format === "base64") //ament_icon是base64字符串
                    await session.send(`[debug]ament_icon_base64 = ${ament_icon.slice(0, 50)}...`)
            }

            if (config.VerboseLoggerMode)
                await session.send(`[debug]icon_format = ${icon_format}`)

            // const ament_icon_buffer = await icon_format === "base64" ? ament_icon : ctx.http.file(ament_icon);
            let ament_icon_buffer;
            if (icon_format === "base64")
                ament_icon_buffer = ament_icon;
            else if (icon_format === "url")
                ament_icon_buffer = await ctx.http.file(ament_icon);

            const ament_icon_base64 = Buffer.from(ament_icon_buffer.data).toString('base64');
            const font_base64 = await fileToBase64(config.fontPath);
            const bg_base64 = await fileToBase64(config.bgPath);

            const res = await renderAmentImage(
                ctx,
                {
                    title: ament_title,
                    description: ament_description,
                    icon: ament_icon_base64,
                    iconMode: 'base64',
                    width: 320,
                    height: 64,
                    // fontPath: path.join(ctx.baseDir, 'assets', 'Minecraft_AE.ttf'),
                    // bgPath: path.join(ctx.baseDir, 'assets', 'AdvancementMade_BG.png')
                    fontBase64: font_base64,
                    bgBase64: bg_base64
                }
            )

            // await session.send(h.image(res));
            await session.send(`[debug] res:${res.slice(0, 50)}`);
            await session.send(
                h(
                    'image',
                    { url: 'data:image/png;base64,' + res }
                )
            )
        })

    function logInfo(...args: any[]) {
        (ctx.logger.info as (...args: any[]) => void)(...args);
    }

    const extractImageUrl = (content) => {
        let urls = h.select(content, 'img').map(item => item.attrs.src);
        if (urls?.length > 0) {
            return urls;
        }
        urls = h.select(content, 'mface').map(item => item.attrs.url);
        return urls?.length > 0 ? urls : null;
    };

    async function fileToBase64(filePath: string): Promise<string> {
        try {
            const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(__dirname, filePath);
            const buffer = await readFile(absolutePath);
            return buffer.toString('base64');
        } catch (error) {
            ctx.logger.error(`Error converting file to base64: ${error.message}`);
            throw error;
        }
    }
}
