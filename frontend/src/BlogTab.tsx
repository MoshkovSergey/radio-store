import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { api, resolveMediaUrl } from './api';
import type { BlogPost, BlogPostPayload } from './types';

function formatDate(value: string | null | undefined): string {
	if (!value) {
		return '—';
	}

	return new Date(value).toLocaleString('ru-RU');
}

export function BlogTab() {
	const [posts, setPosts] = useState<BlogPost[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [showForm, setShowForm] = useState(false);
	const [editingPost, setEditingPost] = useState<BlogPost | null>(null);

	const load = useCallback(async () => {
		setLoading(true);
		setError('');

		try {
			const response = await api.listBlogPosts();
			setPosts(response);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось загрузить статьи');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	async function handleSave(payload: BlogPostPayload) {
		if (editingPost) {
			await api.updateBlogPost(editingPost.id, payload);
		} else {
			await api.createBlogPost(payload);
		}

		await load();
		setEditingPost(null);
		setShowForm(false);
	}

	async function togglePublished(post: BlogPost) {
		setError('');

		try {
			await api.updateBlogPost(post.id, {
				slug: post.slug,
				title: post.title,
				excerpt: post.excerpt ?? null,
				body: post.body,
				author: post.author ?? null,
				is_published: !post.is_published,
			});
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось изменить статус');
		}
	}

	async function handleDelete(post: BlogPost) {
		if (!confirm(`Удалить статью «${post.title}»?`)) {
			return;
		}

		setError('');

		try {
			await api.deleteBlogPost(post.id);
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось удалить статью');
		}
	}

	if (loading) {
		return <p>Загрузка статей...</p>;
	}

	return (
		<section>
			<div className="card">
				<div className="actions" style={{ marginTop: 0 }}>
					<button
						className="button primary"
						onClick={() => {
							setEditingPost(null);
							setShowForm(true);
						}}
					>
						Добавить статью
					</button>
					<button className="button" onClick={() => void load()}>
						Обновить
					</button>
				</div>

				{error ? <div className="error">{error}</div> : null}
			</div>

			{showForm ? (
				<div className="card">
					<h3>{editingPost ? 'Редактирование статьи' : 'Новая статья'}</h3>
					<BlogForm
						initial={editingPost}
						onSave={handleSave}
						onCancel={() => {
							setShowForm(false);
							setEditingPost(null);
						}}
					/>
				</div>
			) : null}

			{editingPost ? null : null}

			<div className="card">
				<table className="table">
					<thead>
						<tr>
							<th>Обложка</th>
							<th>ID</th>
							<th>Заголовок</th>
							<th>Slug</th>
							<th>Автор</th>
							<th>Статус</th>
							<th>Опубликована</th>
							<th>Действия</th>
						</tr>
					</thead>
					<tbody>
						{posts.map((post) => (
							<tr key={post.id}>
								<td>
									{post.cover_image_url ? (
										<img
											className="table-thumb"
											src={resolveMediaUrl(post.cover_image_url)}
											alt={post.title}
										/>
									) : (
										<div className="table-thumb placeholder">нет</div>
									)}
								</td>
								<td>{post.id}</td>
								<td>
									<div>{post.title}</div>
									{post.excerpt ? (
										<div className="small muted">{post.excerpt}</div>
									) : null}
								</td>
								<td className="small muted">{post.slug}</td>
								<td>{post.author ?? '—'}</td>
								<td>
									{post.is_published ? (
										<span className="badge green">Опубликована</span>
									) : (
										<span className="badge">Черновик</span>
									)}
								</td>
								<td className="small">{formatDate(post.published_at)}</td>
								<td>
									<div className="actions" style={{ marginTop: 0 }}>
										<button
											className="button"
											onClick={() => {
												setEditingPost(post);
												setShowForm(true);
											}}
										>
											Изменить
										</button>
										<button className="button" onClick={() => void togglePublished(post)}>
											{post.is_published ? 'Снять с публикации' : 'Опубликовать'}
										</button>
										<button
											className="button danger"
											onClick={() => void handleDelete(post)}
										>
											Удалить
										</button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</section>
	);
}

function BlogForm({
	initial,
	onSave,
	onCancel,
}: {
	initial: BlogPost | null;
	onSave: (payload: BlogPostPayload) => Promise<void>;
	onCancel: () => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);

	const [title, setTitle] = useState(initial?.title ?? '');
	const [slug, setSlug] = useState(initial?.slug ?? '');
	const [author, setAuthor] = useState(initial?.author ?? '');
	const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '');
	const [body, setBody] = useState(initial?.body ?? '');
	const [isPublished, setIsPublished] = useState(initial?.is_published ?? false);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);

	const [cover, setCover] = useState<BlogPost | null>(initial);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [uploading, setUploading] = useState(false);
	const [coverError, setCoverError] = useState('');

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError('');

		const trimmedTitle = title.trim();
		const trimmedSlug = slug.trim();
		const trimmedBody = body.trim();

		if (!trimmedTitle || !trimmedSlug || !trimmedBody) {
			setError('Заголовок, slug и текст статьи обязательны');
			return;
		}

		const payload: BlogPostPayload = {
			title: trimmedTitle,
			slug: trimmedSlug,
			author: author.trim() || null,
			excerpt: excerpt.trim() || null,
			body: trimmedBody,
			is_published: isPublished,
		};

		try {
			setSaving(true);
			await onSave(payload);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Не удалось сохранить статью');
		} finally {
			setSaving(false);
		}
	}

	async function handleUploadCover() {
		if (!cover || !selectedFile) {
			setCoverError('Сохраните статью и выберите файл');
			return;
		}

		setUploading(true);
		setCoverError('');

		try {
			const updated = await api.uploadBlogCover(cover.id, selectedFile);
			setCover(updated);
			setSelectedFile(null);

			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		} catch (err) {
			setCoverError(err instanceof Error ? err.message : 'Не удалось загрузить обложку');
		} finally {
			setUploading(false);
		}
	}

	const coverUrl = cover?.cover_image_url ? resolveMediaUrl(cover.cover_image_url) : '';

	return (
		<form onSubmit={handleSubmit}>
			<div className="form-grid">
				<div className="field">
					<label>Заголовок</label>
					<input
						className="input"
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						required
					/>
				</div>

				<div className="field">
					<label>Slug (адрес статьи)</label>
					<input
						className="input"
						value={slug}
						onChange={(event) => setSlug(event.target.value)}
						placeholder="kak-novaya-statya"
						required
					/>
				</div>

				<div className="field">
					<label>Автор (от чьего имени)</label>
					<input
						className="input"
						value={author}
						onChange={(event) => setAuthor(event.target.value)}
						placeholder="Radio Store"
					/>
				</div>
			</div>

			<div className="field" style={{ marginTop: 12 }}>
				<label>Краткое описание (для карточек и SEO)</label>
				<textarea
					className="textarea"
					style={{ minHeight: 60 }}
					value={excerpt}
					onChange={(event) => setExcerpt(event.target.value)}
				/>
			</div>

			<div className="field" style={{ marginTop: 12 }}>
				<label>Текст статьи (Markdown)</label>
				<textarea
					className="textarea blog-body-input"
					value={body}
					onChange={(event) => setBody(event.target.value)}
					placeholder={'# Заголовок\n\nТекст статьи...\n\n- пункт списка\n**жирный** *курсив* `код`\n\n[ссылка](https://example.com)'}
					required
				/>
				<span className="small muted">
					Поддерживаются: заголовки (#), абзацы, списки (- / 1.), цитаты (&gt;),
					код (```), **жирный**, *курсив*, `код`, [ссылки](url), ![картинки](url).
				</span>
			</div>

			<div className="checkbox-row" style={{ marginTop: 12 }}>
				<input
					id="blog-published"
					type="checkbox"
					checked={isPublished}
					onChange={(event) => setIsPublished(event.target.checked)}
				/>
				<label htmlFor="blog-published">Опубликовать сразу</label>
			</div>

			{error ? <div className="error">{error}</div> : null}

			<div className="actions">
				<button className="button primary" disabled={saving}>
					{saving ? 'Сохранение...' : 'Сохранить'}
				</button>
				<button className="button" type="button" onClick={onCancel}>
					Отмена
				</button>
			</div>

			{initial ? (
				<div className="card blog-cover-panel">
					<h4>Обложка статьи</h4>

					{coverUrl ? (
						<img className="blog-cover-preview" src={coverUrl} alt={initial.title} />
					) : (
						<p className="muted small">Обложка не загружена.</p>
					)}

					<div className="upload-row">
						<input
							ref={fileInputRef}
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							onChange={(event) => {
								const file = event.target.files?.[0] ?? null;
								setSelectedFile(file);
							}}
						/>
						<button
							type="button"
							className="button primary"
							disabled={uploading || !selectedFile}
							onClick={() => void handleUploadCover()}
						>
							{uploading ? 'Загрузка...' : 'Загрузить обложку'}
						</button>
					</div>

					{coverError ? <div className="error">{coverError}</div> : null}
				</div>
			) : (
				<p className="small muted" style={{ marginTop: 12 }}>
					Обложку можно загрузить после сохранения статьи — в режиме редактирования.
				</p>
			)}
		</form>
	);
}