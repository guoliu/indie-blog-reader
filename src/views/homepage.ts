interface Article {
  id: number;
  url: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  published_at: string;
  blog_name: string;
  blog_url: string;
}

export function renderHomepage(articles: Article[], activeFilter: string): string {
  const articleCards = articles.map((article) => `
    <article class="card">
      ${article.cover_image ? `<img src="${escapeHtml(article.cover_image)}" alt="" class="cover" loading="lazy">` : ""}
      <div class="content">
        <span class="blog-name">${escapeHtml(article.blog_name)}</span>
        <h2><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a></h2>
        ${article.description ? `<p class="description">${escapeHtml(truncate(article.description, 150))}</p>` : ""}
        <time datetime="${article.published_at}">${formatDate(article.published_at)}</time>
      </div>
    </article>
  `).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Indie Blog Reader</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header>
    <h1>Indie Blog Reader</h1>
    <nav class="filters">
      <a href="/?filter=today" class="${activeFilter === "today" ? "active" : ""}">New Today</a>
      <a href="/?filter=comments" class="${activeFilter === "comments" ? "active" : ""}">New Comments</a>
    </nav>
    <div class="actions">
      <form action="/api/refresh" method="POST" class="refresh-form">
        <button type="submit" class="refresh-btn">Refresh</button>
      </form>
    </div>
  </header>

  <main>
    <section class="articles">
      ${articles.length > 0 ? articleCards : '<p class="empty">No articles found for this filter.</p>'}
    </section>
  </main>

  <aside class="add-blog">
    <h3>Add New Blog</h3>
    <form action="/api/blogs" method="POST" class="add-form">
      <input type="url" name="url" placeholder="https://example.com" required>
      <input type="text" name="name" placeholder="Blog name (optional)">
      <button type="submit">Add Blog</button>
    </form>
  </aside>

  <script>
    // Handle refresh form with fetch
    document.querySelector('.refresh-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Refreshing...';

      try {
        await fetch('/api/refresh', { method: 'POST' });
        location.reload();
      } catch (err) {
        alert('Refresh failed');
        btn.disabled = false;
        btn.textContent = 'Refresh';
      }
    });

    // Handle add blog form
    document.querySelector('.add-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const url = form.url.value;
      const name = form.name.value;

      try {
        const res = await fetch('/api/blogs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, name: name || undefined })
        });

        if (res.ok) {
          form.reset();
          alert('Blog added successfully');
        } else {
          const data = await res.json();
          alert(data.error || 'Failed to add blog');
        }
      } catch (err) {
        alert('Failed to add blog');
      }
    });
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
