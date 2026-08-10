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

  function goToApp() {
    window.location.href =
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

      goToApp();
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
            'demo-profile-button';

          const name =
            document.createElement(
              'strong'
            );
          name.textContent =
            profile.name;

          const id =
            document.createElement(
              'span'
            );
          id.textContent =
            profile.customerId;

          button.appendChild(name);
          button.appendChild(id);

          button.addEventListener(
            'click',
            () => {
              demoLogin(
                profile.customerId,
                button
              );
            }
          );

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
        goToApp();
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
