(function () {
  const loginForm =
    document.getElementById(
      'loginForm'
    );

  const emailInput =
    document.getElementById(
      'email'
    );

  const passwordInput =
    document.getElementById(
      'password'
    );

  const loginButton =
    document.getElementById(
      'loginButton'
    );

  const loginError =
    document.getElementById(
      'loginError'
    );

  const demoProfiles =
    document.getElementById(
      'demoProfiles'
    );

  function showError(message) {
    loginError.textContent =
      message;
    loginError.hidden = false;
  }

  function clearError() {
    loginError.textContent = '';
    loginError.hidden = true;
  }

  function getSafeReturnTo() {
    const params =
      new URLSearchParams(
        window.location.search
      );

    const returnTo =
      params.get('returnTo');

    if (
      !returnTo ||
      !returnTo.startsWith('/') ||
      returnTo.startsWith('//')
    ) {
      return null;
    }

    if (
      returnTo === '/app' ||
      returnTo.startsWith('/app?') ||
      returnTo === '/chat' ||
      returnTo.startsWith('/chat?') ||
      returnTo === '/whatsapp' ||
      returnTo.startsWith('/whatsapp?')
    ) {
      return returnTo;
    }

    return null;
  }

  function goAfterLogin() {
    window.location.href =
      getSafeReturnTo() ||
      '/app';
  }

  async function login(
    email,
    password
  ) {
    const response =
      await fetch(
        '/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            email,
            password
          })
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        'No se pudo iniciar sesión'
      );
    }

    return data;
  }

  async function demoLogin(
    customerId,
    button
  ) {
    clearError();

    if (button) {
      button.disabled = true;
    }

    try {
      const response =
        await fetch(
          '/api/auth/demo-login',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              customerId
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          'No se pudo abrir el perfil demo'
        );
      }

      goAfterLogin();
    } catch (error) {
      showError(error.message);

      if (button) {
        button.disabled = false;
      }
    }
  }

  async function loadDemoProfiles() {
    try {
      const response =
        await fetch(
          '/api/auth/demo-profiles'
        );

      if (!response.ok) {
        throw new Error();
      }

      const data =
        await response.json();

      demoProfiles.innerHTML = '';

      (data.profiles || [])
        .forEach((profile) => {
          const button =
            document.createElement(
              'button'
            );

          button.type = 'button';
          button.className =
            `demo-profile-button ${profile.release1Pitch ? 'pitch' : 'extended'}`;

          const nameRow =
            document.createElement(
              'span'
            );
          nameRow.className =
            'demo-profile-name-row';

          const name =
            document.createElement(
              'strong'
            );
          name.textContent =
            profile.name;

          const badge =
            document.createElement(
              'em'
            );
          badge.className =
            `demo-profile-badge ${profile.release1Pitch ? 'pitch' : 'extended'}`;
          badge.textContent =
            profile.release1Pitch
              ? 'Pitch R1'
              : 'Cobertura';

          nameRow.appendChild(name);
          nameRow.appendChild(badge);

          const detail =
            document.createElement(
              'span'
            );
          const legacyPitchFallback =
            data.officialDataConfigured ===
              false &&
            profile.release1Pitch === true;

          detail.textContent =
            profile.demoScenarioLabel
              ? `Caso: ${profile.demoScenarioLabel}`
              : legacyPitchFallback
                ? 'Caso sintético de respaldo'
                : profile.officialDataReady === false
                  ? 'Caso oficial local pendiente'
                  : profile.customerId;

          button.appendChild(nameRow);
          button.appendChild(detail);

          if (
            profile.officialDataReady ===
              false &&
            !legacyPitchFallback
          ) {
            button.disabled = true;
            button.classList.add(
              'pending'
            );
            button.title =
              'Ejecuta npm run demo:configure:desafio1 para vincular este perfil a datos oficiales.';
          } else {
            button.addEventListener(
              'click',
              () => {
                demoLogin(
                  profile.customerId,
                  button
                );
              }
            );
          }

          demoProfiles.appendChild(
            button
          );
        });
    } catch (error) {
      demoProfiles.innerHTML =
        '<span class="loading-text">No se pudieron cargar los perfiles de prueba.</span>';
    }
  }

  loginForm.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();
      clearError();

      const email =
        emailInput.value.trim();
      const password =
        passwordInput.value;

      if (!email || !password) {
        showError(
          'Completa el correo y la contraseña.'
        );
        return;
      }

      loginButton.disabled = true;
      loginButton.textContent =
        'Ingresando...';

      try {
        await login(
          email,
          password
        );
        goAfterLogin();
      } catch (error) {
        showError(error.message);
        loginButton.disabled = false;
        loginButton.textContent =
          'Iniciar sesión';
      }
    }
  );

  document
    .querySelectorAll(
      '.credential-button'
    )
    .forEach((button) => {
      button.addEventListener(
        'click',
        () => {
          emailInput.value =
            button.dataset.email;
          passwordInput.value =
            'Demo1234!';
          clearError();
          passwordInput.focus();
        }
      );
    });

  loadDemoProfiles();
})();
