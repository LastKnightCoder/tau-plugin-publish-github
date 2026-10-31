import { definePlugin } from "@tau/plugins";
import { createPublisher } from "./publish";
import { createPublishForm } from "./form";

declare const __PLUGIN_META__: { id: string; name: string; version: string };

export default definePlugin({
  ...__PLUGIN_META__,
  create: () => ({
    activate(context) {
      if (!context.publish) throw new Error("请更新 Tau 以使用博客发布插件");
      context.publish.register({
        id: context.pluginId,
        name: "GitHub Pages",
        create: config => createPublisher(context, config),
      });
      context.settings.register({
        id: "publish",
        title: "GitHub 发布配置",
        target: "publish",
        form: createPublishForm(context.fetch),
      });
    },
  }),
});
