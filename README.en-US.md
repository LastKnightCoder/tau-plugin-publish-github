# GitHub Pages Publish

Publish selected articles, cards, and project documents from Tau as a website hosted for free on GitHub Pages. When you update content later, click "Publish" again and only changed files are uploaded.

## Get Started in 3 Steps

1. **Install the plugin**: Install "GitHub Pages Publish" from the Plugin Center, along with a blog template (such as "Tau Blog") to define how your site looks.
2. **Configure the publishing destination**: Open "Publish" in the sidebar, open Site Settings, choose "GitHub Pages Publish" as the Service, and fill in your Token, Repository, and Deployment branch.
3. **Select content and publish**: Check the items you want to make public on the left and click "Publish". After your first publish, go to "Settings › Pages" in your GitHub repository and set the source to your deployment branch to make the site live.

## Configuration Fields

- **Token**: A GitHub access token with content write permissions for the target repository. Click "Create token" to generate one on GitHub. Protected branches still follow repository push rules.
- **Repository**: Once the token is entered, choose from your list of repositories.
- **Deployment branch**: The branch where site files are stored, such as `gh-pages`. If the branch does not exist yet, it will be created automatically.
- **Base path**: Leave blank in most cases. User site repositories (`your-name.github.io`) are served at `/`, while other repositories use `/repository-name/`.

## Push Methods

By default, Tau pushes using Git Push, which requires Git installed on your computer. You can also choose a Cache directory to keep a local working copy and speed up future publishes. If Git is not installed, turn off "Git Push" to upload individual files via the GitHub API instead. Committer name and email are also configured under "Commit and push".

## FAQ

**Want to use a custom domain?** Enter your domain in the repository's "Settings › Pages", change Base path to `/`, and fill in your domain under "Public URL" in Site Settings. Tau only updates files it generates, so the `CNAME` file created by GitHub will not be removed.

**Broken styles or 404 errors?** This is usually caused by an incorrect Base path. Update it and publish again.

If you only want to export the site to a local folder and deploy it yourself, you do not need this plugin—choose "Local Export" in Site Settings instead. For full details, see [Publish](https://taunote.app/docs/publish/).
