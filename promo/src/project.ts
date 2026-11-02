import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/cyrillic-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import '@fontsource/jetbrains-mono/cyrillic-700.css';
import { makeProject } from '@motion-canvas/core';
import intro from './scenes/intro?scene';
import login from './scenes/login?scene';
import boards from './scenes/boards?scene';
import kanban from './scenes/kanban?scene';
import task from './scenes/task?scene';
import subtasks from './scenes/subtasks?scene';
import realtime from './scenes/realtime?scene';
import customize from './scenes/customize?scene';
import hotkeys from './scenes/hotkeys?scene';
import outro from './scenes/outro?scene';

// canvas рисует текст только загруженным шрифтом — ждём его до старта
await Promise.all([
  document.fonts.load('400 28px "JetBrains Mono"', 'Аб abc'),
  document.fonts.load('700 28px "JetBrains Mono"', 'Аб abc'),
]);

export default makeProject({ scenes: [intro, login, boards, kanban, task, subtasks, realtime, customize, hotkeys, outro] });
