interface Article {
  id: number;
  url: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  published_at: string;
  blog_name: string;
  blog_url: string;
  blog_languages?: string;
}

export function renderHomepage(
  articles: Article[],
  activeFilter: string,
  activeLang?: string
): string {
  const articleCards = articles
    .map(
      (article) => `
    <article class="card">
      ${article.cover_image ? `<img src="${escapeHtml(article.cover_image)}" alt="" class="cover" loading="lazy">` : ""}
      <div class="content">
        <span class="blog-name">${escapeHtml(article.blog_name)}</span>
        <h2><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener">${escapeHtml(article.title)}</a></h2>
        ${article.description ? `<p class="description">${escapeHtml(truncate(article.description, 150))}</p>` : ""}
        <time datetime="${article.published_at}">${formatDate(article.published_at)}</time>
      </div>
    </article>
  `
    )
    .join("");

  // Build URLs with current filter and language
  const buildUrl = (filter: string, lang?: string) => {
    const params = new URLSearchParams();
    if (filter !== "today") params.set("filter", filter);
    if (lang) params.set("lang", lang);
    const queryString = params.toString();
    return queryString ? `/?${queryString}` : "/";
  };

  return `<!DOCTYPE html>
<html lang="${activeLang === "zh" ? "zh-CN" : "en"}">
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
      <a href="${buildUrl("today", activeLang)}" class="${activeFilter === "today" ? "active" : ""}">New Today</a>
      <a href="${buildUrl("comments", activeLang)}" class="${activeFilter === "comments" ? "active" : ""}">New Comments</a>
    </nav>
    <nav class="language-switcher">
      <a href="${buildUrl(activeFilter)}" class="${!activeLang ? "active" : ""}">All</a>
      <a href="${buildUrl(activeFilter, "zh")}" class="${activeLang === "zh" ? "active" : ""}">中文</a>
      <a href="${buildUrl(activeFilter, "en")}" class="${activeLang === "en" ? "active" : ""}">English</a>
    </nav>
  </header>

  <!-- Live update indicator -->
  <div id="live-indicator" class="live-indicator">
    <span class="live-dot"></span>
    <span class="live-text">Live</span>
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
    // Connect to SSE for live updates
    const currentLang = ${activeLang ? `'${activeLang}'` : "null"};
    const sseUrl = currentLang ? '/api/events?lang=' + currentLang : '/api/events';

    let eventSource = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000;

    function connectSSE() {
      eventSource = new EventSource(sseUrl);

      eventSource.onopen = () => {
        console.log('SSE connected');
        reconnectAttempts = 0;
        document.getElementById('live-indicator').classList.add('connected');
      };

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'new_article') {
          // Prepend new article card to the feed
          prependArticle(data.data.article, data.data.blog);
        } else if (data.type === 'indexer_progress') {
          // Could show indexing progress in status bar
          console.log('Indexer progress:', data.data);
        }
      };

      eventSource.onerror = () => {
        console.log('SSE disconnected');
        document.getElementById('live-indicator').classList.remove('connected');
        eventSource.close();

        if (reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          setTimeout(connectSSE, reconnectDelay * reconnectAttempts);
        }
      };
    }

    function prependArticle(article, blog) {
      const articlesSection = document.querySelector('.articles');
      const emptyMessage = articlesSection.querySelector('.empty');
      if (emptyMessage) {
        emptyMessage.remove();
      }

      const card = document.createElement('article');
      card.className = 'card new-article';
      card.innerHTML = \`
        \${article.cover_image ? '<img src="' + escapeHtml(article.cover_image) + '" alt="" class="cover" loading="lazy">' : ''}
        <div class="content">
          <span class="blog-name">\${escapeHtml(blog.name || 'Unknown')}</span>
          <h2><a href="\${escapeHtml(article.url)}" target="_blank" rel="noopener">\${escapeHtml(article.title)}</a></h2>
          \${article.description ? '<p class="description">' + escapeHtml(truncate(article.description, 150)) + '</p>' : ''}
          <time datetime="\${article.published_at}">\${formatDate(article.published_at)}</time>
        </div>
      \`;

      articlesSection.insertBefore(card, articlesSection.firstChild);

      // Animate the new card
      setTimeout(() => card.classList.remove('new-article'), 500);
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function truncate(text, maxLength) {
      if (!text || text.length <= maxLength) return text || '';
      return text.slice(0, maxLength).trim() + '...';
    }

    function formatDate(dateStr) {
      const date = new Date(dateStr);
      return date.toLocaleDateString('${activeLang === "zh" ? "zh-CN" : "en-US"}', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }

    // Start SSE connection
    connectSSE();

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
          alert('Blog added successfully! It will be indexed automatically.');
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
