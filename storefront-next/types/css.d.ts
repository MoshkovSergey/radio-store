/**
 * Декларации для глобальных CSS-импортов (side-effect import './file.css').
 *
 * TypeScript 5.6+ требует наличие декларации модуля даже для side-effect
 * импорта (иначе ошибка TS2882). Next.js декларирует CSS Modules
 * (*.module.css), но не гарантирует декларацию для голого *.css,
 * поэтому добавляем shim вручную.
 *
 * ВНИМАНИЕ: паттерн '*.css' матчит в том числе '*.module.css'. В этом
 * проекте CSS Modules НЕ используются (весь CSS глобальный: globals.css,
 * blog-styles.css), поэтому перекрытие безопасно. Если позже добавишь
 * *.module.css с типизированными именами классов — удали эту декларацию
 * или сузь её, чтобы не ломать typing модулей.
 */
declare module '*.css' {
  const content: string
  export default content
}