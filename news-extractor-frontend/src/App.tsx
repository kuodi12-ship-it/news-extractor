import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Newspaper, Link2, Trash2, ExternalLink } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface NewsItem {
  url: string;
  title: string;
  summary: string;
  image_url: string | null;
  tags: string[];
}

function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);

  // Load existing news on mount
  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      const res = await fetch(`${API_URL}/api/news`);
      if (res.ok) {
        const data = await res.json();
        setNews(data);
      }
    } catch {
      // Silent fail on initial load
    }
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to extract news");
      }

      const newsItem: NewsItem = await res.json();
      setNews((prev) => [newsItem, ...prev]);
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    try {
      await fetch(`${API_URL}/api/news`, { method: "DELETE" });
      setNews([]);
    } catch {
      // Silent fail
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Newspaper className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              AI News Extractor
            </h1>
            <p className="text-sm text-slate-500">
              Cole a URL de uma notícia e deixe a IA extrair o conteúdo
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* URL Input Form */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Link2 className="h-5 w-5" />
              Nova Notícia
            </CardTitle>
            <CardDescription>
              Insira a URL de uma notícia para extrair título, resumo, imagem e
              tags automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleExtract} className="flex gap-3">
              <Input
                type="url"
                placeholder="https://exemplo.com/noticia..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                className="flex-1"
                required
              />
              <Button type="submit" disabled={loading || !url.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extraindo...
                  </>
                ) : (
                  "Extrair"
                )}
              </Button>
            </form>
            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* News List Header */}
        {news.length > 0 && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-700">
              Notícias Extraídas ({news.length})
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Limpar Tudo
            </Button>
          </div>
        )}

        {/* News Cards */}
        <div className="space-y-4">
          {news.map((item, index) => (
            <Card
              key={index}
              className="overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col sm:flex-row">
                {/* Image */}
                {item.image_url && (
                  <div className="sm:w-48 sm:min-h-full flex-shrink-0">
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-40 sm:h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base leading-snug">
                      {item.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {item.summary}
                    </p>
                  </CardContent>
                  <CardFooter className="flex flex-wrap items-center gap-2 pt-2">
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {item.tags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Ver original
                    </a>
                  </CardFooter>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {news.length === 0 && !loading && (
          <div className="text-center py-16">
            <Newspaper className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-500 mb-1">
              Nenhuma notícia extraída ainda
            </h3>
            <p className="text-sm text-slate-400">
              Cole uma URL acima para começar
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
