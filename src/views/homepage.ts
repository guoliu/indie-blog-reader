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

  <!-- Progress overlay -->
  <div id="progress-overlay" class="progress-overlay hidden">
    <div class="progress-container">
      <div id="progress-bar" class="progress-bar">
        <div class="progress-fill" style="width: 0%"></div>
      </div>
      <p id="progress-text" class="progress-text">Refreshing...</p>
    </div>
  </div>

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
    // Handle refresh form with SSE streaming
    document.querySelector('.refresh-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Refreshing...';

      const overlay = document.getElementById('progress-overlay');
      const progressBar = document.querySelector('.progress-fill');
      const progressText = document.getElementById('progress-text');

      overlay.classList.remove('hidden');

      const eventSource = new EventSource('/api/refresh/stream?limit=100');

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'start') {
          progressText.textContent = 'Starting refresh...';
          progressBar.style.width = '0%';
        } else if (data.type === 'progress') {
          const percent = Math.round((data.current / data.total) * 100);
          progressBar.style.width = percent + '%';
          progressText.textContent = 'Refreshing... ' + data.current + '/' + data.total + ' blogs (' + data.newArticles + ' new articles)';
        } else if (data.type === 'complete') {
          progressBar.style.width = '100%';
          progressText.textContent = 'Done! ' + data.newArticles + ' new articles found.';
          eventSource.close();
          setTimeout(() => location.reload(), 1000);
        } else if (data.type === 'error') {
          progressText.textContent = 'Error: ' + data.message;
          eventSource.close();
          setTimeout(() => {
            overlay.classList.add('hidden');
            btn.disabled = false;
            btn.textContent = 'Refresh';
          }, 3000);
        }
      };

      eventSource.onerror = () => {
        progressText.textContent = 'Connection lost. Retrying...';
        eventSource.close();
        setTimeout(() => {
          overlay.classList.add('hidden');
          btn.disabled = false;
          btn.textContent = 'Refresh';
        }, 2000);
      };
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
