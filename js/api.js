/* ---------------------------------------------------------------------
   CyberYardHub API wrapper
   -----------------------------------------------------------------------
   A thin fetch() wrapper around the real backend (Phases 2-3: auth +
   challenges). Every request sends credentials so the httpOnly session
   cookie set by the backend is included automatically — this file never
   reads, stores, or forwards the cookie value itself; the browser handles
   that entirely on its own.

   Nothing in this file ever expects a "flag" field back from the server —
   the backend's challenge responses never contain one, by design.

   Loaded before js/script.js (see index.html) and exposes a single global,
   window.CyberYardHubAPI, for script.js to call.
--------------------------------------------------------------------- */
(function () {
  /**
   * Where the backend API lives. Defaults to the backend's own documented
   * local default (PORT=4000, see backend/.env.example). Override without
   * editing this file by adding, before this script tag in index.html:
   *   <meta name="cyberyardhub-api-base" content="http://localhost:4000/api">
   * or by setting window.CYBERYARDHUB_API_BASE_URL in an inline script
   * before this file loads.
   */
  const metaTag = document.querySelector('meta[name="cyberyardhub-api-base"]');
  const configuredBase =
    (metaTag && metaTag.content && metaTag.content.trim()) ||
    window.CYBERYARDHUB_API_BASE_URL;
  const isLocalDevelopment = window.location.protocol === 'file:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  const sameOriginBase = isLocalDevelopment
    ? 'http://localhost:4000/api'
    : `${window.location.origin}/api`;
  const API_BASE_URL = configuredBase || sameOriginBase;

  /**
   * A failed fetch on a credentialed request is genuinely ambiguous: the
   * network could be down, the CORS preflight could have been rejected, or
   * — the confusing case that made login look permanently broken — some
   * *other* application is listening on the API port, so the browser never
   * receives the CyberYardHub response and reports it as a network error.
   * Name all three possibilities instead of a bare "check your connection".
   */
  function unreachableMessage(cause) {
    const host = (() => {
      try { return new URL(API_BASE_URL).host; } catch { return API_BASE_URL; }
    })();
    return (
      `Could not reach the CyberYardHub API at ${host}. Start it with \`npm run dev\`, ` +
      'and check that no other application is using that port — a foreign server on it ' +
      'is rejected by CORS and surfaces here as an unreachable API.'
    );
  }

  /**
   * Core request helper. Always sends credentials:'include' so the
   * session cookie travels with every request — this is what makes the
   * server session (not localStorage) the authoritative source of "am I
   * logged in", per the app's auth design.
   *
   * Throws an Error on any non-2xx response or network failure, with:
   *   - err.status     the HTTP status code (absent on network errors)
   *   - err.code        the backend's ApiError machine-readable code, if any
   *   - err.issues      Zod's flattened validation issues, if any
   *   - err.isNetworkError  true if fetch() itself failed (offline, CORS, etc.)
   */
  async function request(path, { method = 'GET', body, timeoutMs } = {}) {
    let res;
    try {
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      // Never hang indefinitely: abort after timeoutMs (default 20s).
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller
        ? setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 20000)
        : null;
      try {
        res = await fetch(API_BASE_URL + path, {
          method,
          credentials: 'include',
          headers: body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : undefined,
          body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
          signal: controller ? controller.signal : undefined,
        });
      } finally {
        if (timer !== null) clearTimeout(timer);
      }
    } catch (networkErr) {
      const err = new Error(
        networkErr && networkErr.name === 'AbortError'
          ? 'The request timed out. Please try again.'
          : unreachableMessage(networkErr)
      );
      err.isNetworkError = true;
      err.cause = networkErr;
      throw err;
    }

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // No/invalid JSON body (e.g. a 204 or an upstream proxy error page) —
      // fall through with data = null; status-based handling below still works.
    }

    if (!res.ok) {
      const message = (data && data.error && data.error.message) || `Request failed (${res.status}).`;
      const err = new Error(message);
      err.status = res.status;
      err.code = data && data.error && data.error.code;
      err.issues = data && data.error && data.error.issues;
      throw err;
    }

    return data;
  }

  function buildSimpleQueryString(params) {
    if (!params) return '';
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    const str = qs.toString();
    return str ? '?' + str : '';
  }

  function buildQueryString(params) {
    if (!params) return '';
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category && params.category !== 'all') qs.set('category', params.category);
    if (params.difficulty && params.difficulty !== 'all') qs.set('difficulty', params.difficulty);
    if (params.solved && params.solved !== 'all') qs.set('solved', params.solved);
    if (params.sort && params.sort !== 'newest') qs.set('sort', params.sort);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    const str = qs.toString();
    return str ? '?' + str : '';
  }


  function buildNotificationQueryString(params) {
    if (!params) return '';
    const qs = new URLSearchParams();
    if (params.read && params.read !== 'all') qs.set('read', params.read);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    const str = qs.toString();
    return str ? '?' + str : '';
  }

  function buildActivityQueryString(params) {
    if (!params) return '';
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    const str = qs.toString();
    return str ? '?' + str : '';
  }

  function buildAdminChallengeQueryString(params) {
    if (!params) return '';
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.categoryId) qs.set('categoryId', String(params.categoryId));
    if (params.difficultyId) qs.set('difficultyId', String(params.difficultyId));
    if (params.status) qs.set('status', params.status);
    if (params.limit !== undefined) qs.set('limit', String(params.limit));
    if (params.offset !== undefined) qs.set('offset', String(params.offset));
    const str = qs.toString();
    return str ? '?' + str : '';
  }

  window.CyberYardHubAPI = {
    auth: {
      register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
      login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
      logout: () => request('/auth/logout', { method: 'POST' }),
      me: () => request('/auth/me', { method: 'GET' }),
      forgotPassword: (payload) => request('/auth/forgot-password', { method: 'POST', body: payload }),
      resetPassword: (payload) => request('/auth/reset-password', { method: 'POST', body: payload }),
      verifyEmail: (payload) => request('/auth/verify-email', { method: 'POST', body: payload }),
      resendVerification: () => request('/auth/resend-verification', { method: 'POST' }),
      changePassword: (payload) => request('/auth/change-password', { method: 'POST', body: payload }),
      sessions: () => request('/auth/sessions', { method: 'GET' }),
      revokeSession: (id) => request('/auth/sessions/' + encodeURIComponent(id), { method: 'DELETE' }),
      revokeOtherSessions: () => request('/auth/sessions/others', { method: 'DELETE' }),
    },
    categories: {
      list: () => request('/categories', { method: 'GET' }),
    },
    difficulties: {
      list: () => request('/difficulties', { method: 'GET' }),
    },
    leaderboard: {
      list: (params) => request('/leaderboard' + buildSimpleQueryString(params), { method: 'GET' }),
    },
    users: {
      meStats: () => request('/users/me/stats', { method: 'GET' }),
      stats: (id) => request('/users/' + encodeURIComponent(id) + '/stats', { method: 'GET' }),
      profile: (id) => request('/users/' + encodeURIComponent(id) + '/profile', { method: 'GET' }),
      meProfile: () => request('/users/me/profile', { method: 'GET' }),
      updateProfile: (payload) => request('/users/me/profile', { method: 'PATCH', body: payload }),
      follow: (id) => request('/users/' + encodeURIComponent(id) + '/follow', { method: 'POST' }),
      unfollow: (id) => request('/users/' + encodeURIComponent(id) + '/follow', { method: 'DELETE' }),
      followers: (id, params) => request('/users/' + encodeURIComponent(id) + '/followers' + buildSimpleQueryString(params), { method: 'GET' }),
      following: (id, params) => request('/users/' + encodeURIComponent(id) + '/following' + buildSimpleQueryString(params), { method: 'GET' }),
      block: (id) => request('/users/' + encodeURIComponent(id) + '/block', { method: 'POST' }),
      unblock: (id) => request('/users/' + encodeURIComponent(id) + '/block', { method: 'DELETE' }),
      blocked: (params) => request('/users/me/blocked' + buildSimpleQueryString(params), { method: 'GET' }),
    },
    notifications: {
      list: (params) => request('/notifications' + buildNotificationQueryString(params), { method: 'GET' }),
      unreadCount: () => request('/notifications/unread-count', { method: 'GET' }),
      markRead: (id) => request('/notifications/' + encodeURIComponent(id) + '/read', { method: 'PATCH' }),
      markAllRead: () => request('/notifications/read-all', { method: 'PATCH' }),
    },
    activity: {
      list: (params) => request('/activity' + buildActivityQueryString(params), { method: 'GET' }),
    },
    events: {
      list: (params) => { const qs = new URLSearchParams(); if(params?.search) qs.set('search', params.search); if(params?.status) qs.set('status', params.status); if(params?.sort) qs.set('sort', params.sort); if(params?.limit !== undefined) qs.set('limit', String(params.limit)); if(params?.offset !== undefined) qs.set('offset', String(params.offset)); const q=qs.toString(); return request('/events' + (q ? '?' + q : ''), { method:'GET' }); },
      get: (id) => request('/events/' + encodeURIComponent(id), { method:'GET' }),
      challenges: (id) => request('/events/' + encodeURIComponent(id) + '/challenges', { method:'GET' }),
      leaderboard: (id, params) => request('/events/' + encodeURIComponent(id) + '/leaderboard' + buildSimpleQueryString(params), { method:'GET' }),
      announcements: (id) => request('/events/' + encodeURIComponent(id) + '/announcements', { method:'GET' }),
      stats: (id) => request('/events/' + encodeURIComponent(id) + '/stats', { method:'GET' }),
      register: (id) => request('/events/' + encodeURIComponent(id) + '/register', { method:'POST' }),
      unregister: (id) => request('/events/' + encodeURIComponent(id) + '/register', { method:'DELETE' }),
      myProgress: (id) => request('/events/' + encodeURIComponent(id) + '/my-progress', { method:'GET' }),
    },
    gamification: {
      me: () => request('/gamification/me', { method: 'GET' }),
      progress: () => request('/gamification/progress', { method: 'GET' }),
      achievements: () => request('/gamification/achievements', { method: 'GET' }),
      categoryProgress: () => request('/gamification/category-progress', { method: 'GET' }),
      difficultyProgress: () => request('/gamification/difficulty-progress', { method: 'GET' }),
    },
    badges: {
      list: () => request('/badges', { method: 'GET' }),
      get: (id) => request('/badges/' + encodeURIComponent(id), { method: 'GET' }),
      mine: () => request('/badges/me', { method: 'GET' }),
    },
    community: {
      feed: (params) => { const qs = new URLSearchParams(); if(params?.limit !== undefined) qs.set('limit', String(params.limit)); if(params?.offset !== undefined) qs.set('offset', String(params.offset)); if(params?.category) qs.set('category', params.category); if(params?.search) qs.set('search', params.search); if(params?.sort) qs.set('sort', params.sort); const q = qs.toString(); return request('/community/feed' + (q ? '?' + q : ''), { method: 'GET' }); },
      posts: {
        list: (params) => { const qs = new URLSearchParams(); if(params?.limit !== undefined) qs.set('limit', String(params.limit)); if(params?.offset !== undefined) qs.set('offset', String(params.offset)); if(params?.category) qs.set('category', params.category); if(params?.search) qs.set('search', params.search); if(params?.sort) qs.set('sort', params.sort); const q = qs.toString(); return request('/community/feed' + (q ? '?' + q : ''), { method: 'GET' }); },
        get: (id) => request('/community/posts/' + encodeURIComponent(id), { method: 'GET' }),
        create: (payload) => request('/community/posts', { method: 'POST', body: payload }),
        update: (id, payload) => request('/community/posts/' + encodeURIComponent(id), { method: 'PATCH', body: payload }),
        remove: (id) => request('/community/posts/' + encodeURIComponent(id), { method: 'DELETE' }),
        like: (id) => request('/community/posts/' + encodeURIComponent(id) + '/reaction', { method: 'POST' }),
        unlike: (id) => request('/community/posts/' + encodeURIComponent(id) + '/reaction', { method: 'DELETE' }),
      },
      comments: {
        list: (postId, params) => request('/community/posts/' + encodeURIComponent(postId) + '/comments' + buildSimpleQueryString(params), { method: 'GET' }),
        create: (postId, payload) => request('/community/posts/' + encodeURIComponent(postId) + '/comments', { method: 'POST', body: payload }),
        update: (postId, commentId, payload) => request('/community/posts/' + encodeURIComponent(postId) + '/comments/' + encodeURIComponent(commentId), { method: 'PATCH', body: payload }),
        remove: (postId, commentId) => request('/community/posts/' + encodeURIComponent(postId) + '/comments/' + encodeURIComponent(commentId), { method: 'DELETE' }),
      },
      reports: { create: (payload) => request('/community/reports', { method: 'POST', body: payload }) },
    },
    admin: {
      overview: () => request('/admin/overview', { method: 'GET' }),
      challenges: {
        list: (params) => request('/admin/challenges' + buildAdminChallengeQueryString(params), { method: 'GET' }),
        get: (id) => request('/admin/challenges/' + encodeURIComponent(id), { method: 'GET' }),
        create: (payload) => request('/admin/challenges', { method: 'POST', body: payload }),
        update: (id, payload) => request('/admin/challenges/' + encodeURIComponent(id), { method: 'PATCH', body: payload }),
        publish: (id) => request('/admin/challenges/' + encodeURIComponent(id) + '/publish', { method: 'POST' }),
        unpublish: (id) => request('/admin/challenges/' + encodeURIComponent(id) + '/unpublish', { method: 'POST' }),
        archive: (id) => request('/admin/challenges/' + encodeURIComponent(id) + '/archive', { method: 'POST' }),
        remove: (id) => request('/admin/challenges/' + encodeURIComponent(id), { method: 'DELETE' }),
      },
      categories: {
        list: () => request('/admin/categories', { method: 'GET' }),
        create: (payload) => request('/admin/categories', { method: 'POST', body: payload }),
        update: (id, payload) => request('/admin/categories/' + encodeURIComponent(id), { method: 'PATCH', body: payload }),
        remove: (id) => request('/admin/categories/' + encodeURIComponent(id), { method: 'DELETE' }),
      },
      difficulties: {
        list: () => request('/admin/difficulties', { method: 'GET' }),
        create: (payload) => request('/admin/difficulties', { method: 'POST', body: payload }),
        update: (id, payload) => request('/admin/difficulties/' + encodeURIComponent(id), { method: 'PATCH', body: payload }),
        remove: (id) => request('/admin/difficulties/' + encodeURIComponent(id), { method: 'DELETE' }),
      },
      hints: {
        list: (challengeId) => request('/admin/challenges/' + encodeURIComponent(challengeId) + '/hints', { method: 'GET' }),
        create: (challengeId, payload) => request('/admin/challenges/' + encodeURIComponent(challengeId) + '/hints', { method: 'POST', body: payload }),
        update: (challengeId, hintId, payload) => request('/admin/challenges/' + encodeURIComponent(challengeId) + '/hints/' + encodeURIComponent(hintId), { method: 'PATCH', body: payload }),
        remove: (challengeId, hintId) => request('/admin/challenges/' + encodeURIComponent(challengeId) + '/hints/' + encodeURIComponent(hintId), { method: 'DELETE' }),
      },
      files: {
        list: (challengeId) => request('/admin/challenges/' + encodeURIComponent(challengeId) + '/files', { method: 'GET' }),
        upload: (challengeId, formData) => request('/admin/challenges/' + encodeURIComponent(challengeId) + '/files', { method: 'POST', body: formData }),
        update: (challengeId, fileId, payload) => request('/admin/challenges/' + encodeURIComponent(challengeId) + '/files/' + encodeURIComponent(fileId), { method: 'PATCH', body: payload }),
        remove: (challengeId, fileId) => request('/admin/challenges/' + encodeURIComponent(challengeId) + '/files/' + encodeURIComponent(fileId), { method: 'DELETE' }),
      },
      badges: {
        list: () => request('/admin/badges', { method: 'GET' }),
        create: (payload) => request('/admin/badges', { method: 'POST', body: payload }),
        update: (id, payload) => request('/admin/badges/' + encodeURIComponent(id), { method: 'PATCH', body: payload }),
        remove: (id) => request('/admin/badges/' + encodeURIComponent(id), { method: 'DELETE' }),
      },
      community: {
        reports: {
          list: (params) => { const qs = new URLSearchParams(); if(params?.status) qs.set('status', params.status); if(params?.limit !== undefined) qs.set('limit', String(params.limit)); if(params?.offset !== undefined) qs.set('offset', String(params.offset)); const q=qs.toString(); return request('/admin/community/reports' + (q ? '?' + q : ''), { method:'GET' }); },
          get: (id) => request('/admin/community/reports/' + encodeURIComponent(id), { method:'GET' }),
          update: (id, payload) => request('/admin/community/reports/' + encodeURIComponent(id), { method:'PATCH', body: payload }),
        },
        deletePost: (id) => request('/admin/community/posts/' + encodeURIComponent(id), { method:'DELETE' }),
        deleteComment: (postId, commentId) => request('/admin/community/posts/' + encodeURIComponent(postId) + '/comments/' + encodeURIComponent(commentId), { method:'DELETE' }),
      },
      events: {
        list: (params) => { const qs=new URLSearchParams(); if(params?.search) qs.set('search',params.search); if(params?.status) qs.set('status',params.status); if(params?.limit!==undefined) qs.set('limit',String(params.limit)); if(params?.offset!==undefined) qs.set('offset',String(params.offset)); const q=qs.toString(); return request('/admin/events'+(q?'?'+q:''),{method:'GET'}); },
        get: (id) => request('/admin/events/'+encodeURIComponent(id),{method:'GET'}),
        create: (payload) => request('/admin/events',{method:'POST',body:payload}),
        update: (id,payload) => request('/admin/events/'+encodeURIComponent(id),{method:'PATCH',body:payload}),
        remove: (id) => request('/admin/events/'+encodeURIComponent(id),{method:'DELETE'}),
        publish: (id) => request('/admin/events/'+encodeURIComponent(id)+'/publish',{method:'POST'}),
        archive: (id) => request('/admin/events/'+encodeURIComponent(id)+'/archive',{method:'POST'}),
        addChallenge: (id,payload) => request('/admin/events/'+encodeURIComponent(id)+'/challenges',{method:'POST',body:payload}),
        removeChallenge: (id,challengeId) => request('/admin/events/'+encodeURIComponent(id)+'/challenges/'+encodeURIComponent(challengeId),{method:'DELETE'}),
        reorderChallenges: (id,payload) => request('/admin/events/'+encodeURIComponent(id)+'/challenges/order',{method:'PATCH',body:payload}),
        createAnnouncement: (id,payload) => request('/admin/events/'+encodeURIComponent(id)+'/announcements',{method:'POST',body:payload}),
        updateAnnouncement: (id,announcementId,payload) => request('/admin/events/'+encodeURIComponent(id)+'/announcements/'+encodeURIComponent(announcementId),{method:'PATCH',body:payload}),
        removeAnnouncement: (id,announcementId) => request('/admin/events/'+encodeURIComponent(id)+'/announcements/'+encodeURIComponent(announcementId),{method:'DELETE'}),
        participants: (id,params) => request('/admin/events/'+encodeURIComponent(id)+'/participants'+buildSimpleQueryString(params),{method:'GET'}),
        removeParticipant: (id,registrationId) => request('/admin/events/'+encodeURIComponent(id)+'/participants/'+encodeURIComponent(registrationId),{method:'DELETE'}),
        stats: (id) => request('/admin/events/'+encodeURIComponent(id)+'/stats',{method:'GET'}),
      },
      writeup: {
        get: (challengeId) => request('/admin/challenges/' + encodeURIComponent(challengeId) + '/writeup', { method: 'GET' }),
        save: (challengeId, payload) => request('/admin/challenges/' + encodeURIComponent(challengeId) + '/writeup', { method: 'POST', body: payload }),
        update: (challengeId, payload) => request('/admin/challenges/' + encodeURIComponent(challengeId) + '/writeup', { method: 'PATCH', body: payload }),
        remove: (challengeId) => request('/admin/challenges/' + encodeURIComponent(challengeId) + '/writeup', { method: 'DELETE' }),
      },
    },
    challengeExtras: {
      hints: {
        list: (challengeId) => request('/challenges/' + encodeURIComponent(challengeId) + '/hints', { method: 'GET' }),
        unlock: (challengeId, hintId) => request('/challenges/' + encodeURIComponent(challengeId) + '/hints/' + encodeURIComponent(hintId) + '/unlock', { method: 'POST' }),
      },
      files: {
        list: (challengeId) => request('/challenges/' + encodeURIComponent(challengeId) + '/files', { method: 'GET' }),
        downloadUrl: (challengeId, fileId) => API_BASE_URL + '/challenges/' + encodeURIComponent(challengeId) + '/files/' + encodeURIComponent(fileId) + '/download',
      },
      writeup: {
        get: (challengeId) => request('/challenges/' + encodeURIComponent(challengeId) + '/writeup', { method: 'GET' }),
      },
    },
    challenges: {
      list: (params) => request('/challenges' + buildQueryString(params), { method: 'GET' }),
      get: (id) => request('/challenges/' + encodeURIComponent(id), { method: 'GET' }),
      submit: (id, flag) =>
        request('/challenges/' + encodeURIComponent(id) + '/submit', { method: 'POST', body: { flag } }),
    },
  };
})();
