import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  href: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Хлебные крошки">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        if (isLast) {
          return <span key={item.href}>{item.label}</span>;
        }

        return (
          <span key={item.href} style={{ display: 'contents' }}>
            <Link href={item.href}>{item.label}</Link>
            <span aria-hidden>/</span>
          </span>
        );
      })}
    </nav>
  );
}