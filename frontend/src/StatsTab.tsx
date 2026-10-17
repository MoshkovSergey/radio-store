import { useCallback, useEffect, useState } from 'react';

import { api } from './api';
import type { SiteVisitStats } from './api';

export function StatsTab() {
  const [stats, setStats] = useState<SiteVisitStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await api.getSiteVisitStats(days);
      setStats(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p>Загрузка статистики...</p>;
  }

  return (
    <section>
      <div className="card">
        <div className="actions" style={{ marginTop: 0 }}>
          <label>
            Период:
            <select
              className="select"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              style={{ marginLeft: 8 }}
            >
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
              <option value={365}>Год</option>
            </select>
          </label>
          <button className="button" onClick={() => void load()}>
            Обновить
          </button>
        </div>

        {error ? <div className="error">{error}</div> : null}
      </div>

      {stats ? (
        <>
          <div className="card">
            <h3>Общая статистика</h3>
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <div>
                <div className="small muted">Всего посещений</div>
                <div style={{ fontSize: '32px', fontWeight: 700 }}>
                  {stats.total_visits}
                </div>
              </div>
              <div>
                <div className="small muted">Уникальных посетителей</div>
                <div style={{ fontSize: '32px', fontWeight: 700 }}>
                  {stats.total_unique}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3>Топ-10 страниц</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Страница</th>
                  <th>Посещений</th>
                  <th>Уникальных</th>
                </tr>
              </thead>
              <tbody>
                {stats.top_pages.map((row) => (
                  <tr key={row.page_path}>
                    <td className="small">{row.page_path}</td>
                    <td>{row.visits}</td>
                    <td>{row.unique}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h3>Посещения по дням</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Посещений</th>
                </tr>
              </thead>
              <tbody>
                {stats.visits_by_day.map((day) => (
                  <tr key={day.date}>
                    <td>{day.date}</td>
                    <td>{day.visits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}