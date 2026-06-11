/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from './types';
import Login from './components/Login';
import Layout from './components/Layout';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Check local storage for saved session
  useEffect(() => {
    const savedUser = localStorage.getItem('pcvt_user');
    const savedAllUsers = localStorage.getItem('pcvt_allUsers');
    if (savedUser && savedAllUsers) {
      try {
        setCurrentUser(JSON.parse(savedUser));
        setAllUsers(JSON.parse(savedAllUsers));
      } catch (e) {
        // Invalid JSON, clear it
        localStorage.removeItem('pcvt_user');
        localStorage.removeItem('pcvt_allUsers');
      }
    }
  }, []);

  const handleLogin = (user: User, users: User[]) => {
    setCurrentUser(user);
    setAllUsers(users);
    localStorage.setItem('pcvt_user', JSON.stringify(user));
    localStorage.setItem('pcvt_allUsers', JSON.stringify(users));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setAllUsers([]);
    localStorage.removeItem('pcvt_user');
    localStorage.removeItem('pcvt_allUsers');
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return <Layout currentUser={currentUser} allUsers={allUsers} onLogout={handleLogout} />;
}

