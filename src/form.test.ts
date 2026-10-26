import { expect, it, vi } from "vitest";
import { createPublishForm } from "./form";

const signal = () => new AbortController().signal;

it("缓存目录只在 Git Push 开启时显示，名称与标识分开保存", () => {
  const form = createPublishForm(vi.fn() as unknown as typeof fetch);
  const fields = form.groups.flatMap(group => group.fields);
  expect(new Set(fields.map(field => field.key)).size).toBe(fields.length);
  const cache = fields.find(field => field.key === "cacheId");
  expect(cache).toMatchObject({
    type: "service-choice",
    service: "git.cacheDirectory",
    labelKey: "cacheLabel",
    visibleWhen: { key: "useGitCli", equals: "true" },
  });
  expect(fields.find(field => field.key === "useGitCli")).toMatchObject({
    type: "switch",
    default: true,
  });
});

it("仓库分页加载全名，分支按 owner/repo 编码", async () => {
  const urls: string[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/user/repos"))
      return Response.json(
        url.endsWith("page=1")
          ? Array.from({ length: 100 }, (_, index) => ({ full_name: `o/r${index}`, private: false }))
          : [{ full_name: "o/last", private: true }]
      );
    return Response.json([{ name: "gh-pages" }]);
  }) as unknown as typeof globalThis.fetch;
  const form = createPublishForm(fetch);
  const [repo, branch] = form.groups[1].fields;
  if (repo.type !== "remote-choice" || branch.type !== "remote-choice") throw new Error("类型错误");
  const repos = await repo.load({ token: "t" }, signal());
  expect(repos).toHaveLength(101);
  expect(repos.at(-1)).toEqual({ value: "o/last", description: "私有" });
  expect(await branch.load({ token: "t", repo: "o/my blog" }, signal())).toEqual([
    { value: "gh-pages" },
  ]);
  expect(urls.at(-1)).toContain("/repos/o/my%20blog/branches");
  await expect(repo.load({ token: "" }, signal())).rejects.toThrow("Token");
});

it("保存前校验仓库格式并去掉空白", async () => {
  const form = createPublishForm(vi.fn() as unknown as typeof fetch);
  await expect(
    form.beforeSave!({ token: "t", repo: "bad", branch: "main" }, signal())
  ).rejects.toThrow("owner/repo");
  expect(
    await form.beforeSave!({ token: " t ", repo: " o/r ", branch: " main " }, signal())
  ).toMatchObject({ token: "t", repo: "o/r", branch: "main" });
});
