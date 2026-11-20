import { createContext, useContext } from 'react';

export interface NavContextValue {
  /** bar — кнопки в шапке (текст), side — боковая панель (иконка + текст) */
  variant: 'bar' | 'side';
  /** боковая панель в минимальном виде: только иконки */
  collapsed: boolean;
  /** где находится панель: от этого зависит, в какую сторону открываются всплывающие окна */
  position: 'top' | 'left' | 'right';
}

export const NavContext = createContext<NavContextValue>({ variant: 'bar', collapsed: false, position: 'top' });
export const useNav = () => useContext(NavContext);
