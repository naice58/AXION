
const API_BASE = 'https://axion-muscle-api.onrender.com';

const PRODUCTS = {
  suplemento: {
    name: 'Axion Muscle',
    price: 39.90
  },
  ebook: {
    name: 'E-book de Emagrecimento e Ganho de Massa',
    price: 19.90
  },
  combo: {
    name: 'Combo Axion Muscle + E-book',
    price: 69.90
  }
};

const checkoutDialog = document.querySelector('#checkout-dialog');
const checkoutForm = document.querySelector('#checkout-form');
const selectedProduct = document.querySelector('#selected-product');
const pixResult = document.querySelector('#pix-result');
const pixCode = document.querySelector('#pix-code');
const pixSummary = document.querySelector('#pix-summary');
const paymentStatus = document.querySelector('#payment-status');
const formError = document.querySelector('#form-error');

let activeProductId = null;
let activeOrderId = null;
let statusTimer = null;
let submitting = false;

function formatPrice(value) {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function showError(message) {
  if (formError) {
    formError.textContent = message;
    formError.hidden = false;
  } else {
    alert(message);
  }
}

function clearError() {
  if (formError) {
    formError.textContent = '';
    formError.hidden = true;
  }
}

function setSubmitting(value) {
  submitting = value;

  const submitButton = checkoutForm?.querySelector(
    'button[type="submit"], input[type="submit"]'
  );

  if (submitButton) {
    submitButton.disabled = value;
    submitButton.textContent = value
      ? 'Gerando PIX...'
      : 'Gerar PIX';
  }
}

function stopStatusPolling() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
}

function openCheckout(productId) {
  const product = PRODUCTS[productId];

  if (!product) {
    showError('Produto não reconhecido. Atualize a página e tente novamente.');
    return;
  }

  activeProductId = productId;
  activeOrderId = null;

  stopStatusPolling();
  clearError();

  if (checkoutForm) {
    checkoutForm.reset();
  }

  if (selectedProduct) {
    selectedProduct.textContent =
      `${product.name} — ${formatPrice(product.price)}`;
  }

  if (pixResult) {
    pixResult.hidden = true;
  }

  if (paymentStatus) {
    paymentStatus.textContent = '';
  }

  if (checkoutDialog) {
    if (typeof checkoutDialog.showModal === 'function') {
      if (!checkoutDialog.open) checkoutDialog.showModal();
    } else {
      checkoutDialog.setAttribute('open', '');
    }
  } else {
    showError('A janela de checkout não foi encontrada no index.html.');
  }
}

document.querySelectorAll('.buy-button').forEach((button) => {
  button.addEventListener('click', () => {
    const productId = button.dataset.product;
    openCheckout(productId);
  });
});

async function readResponse(response) {
  const text = await response.text();

  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.error ||
      `Erro na solicitação (${response.status}).`
    );
  }

  return data;
}

function getOrderId(data) {
  return data.orderId ||
    data.order_id ||
    data.order?.id ||
    data.order?.orderId ||
    data.id ||
    null;
}

function getPixCode(data) {
  return data.copyPaste ||
    data.copy_paste ||
    data.pixCopyPaste ||
    data.pixCode ||
    data.pix_code ||
    data.brCode ||
    data.qrCodeText ||
    data.payment?.copyPaste ||
    data.payment?.pixCode ||
    data.order?.copyPaste ||
    data.order?.pixCode ||
    '';
}

function getOrderStatus(data) {
  return String(
    data.status ||
    data.paymentStatus ||
    data.payment_status ||
    data.order?.status ||
    ''
  ).toUpperCase();
}

async function checkPaymentStatus() {
  if (!activeOrderId) return;

  try {
    const response = await fetch(
      `${API_BASE}/api/orders/${encodeURIComponent(activeOrderId)}`,
      { method: 'GET', cache: 'no-store' }
    );

    const data = await readResponse(response);
    const status = getOrderStatus(data);

    if (status === 'PAID' || status === 'PAGO' || status === 'COMPLETO') {
      stopStatusPolling();

      if (paymentStatus) {
        paymentStatus.textContent = 'Pagamento confirmado!';
      }

      return;
    }

    if (
      ['FAILED', 'FALHOU', 'CANCELADO', 'CANCELADA', 'EXPIRADO', 'EXPIRED', 'RECUSADO'].includes(status)
    ) {
      stopStatusPolling();

      if (paymentStatus) {
        paymentStatus.textContent =
          'O pagamento não foi concluído. Tente novamente.';
      }

      return;
    }

    if (paymentStatus) {
      paymentStatus.textContent =
        'Aguardando confirmação do pagamento PIX...';
    }
  } catch (error) {
    console.error('Erro ao consultar o pagamento:', error);

    if (paymentStatus) {
      paymentStatus.textContent =
        'Não foi possível atualizar o status agora. Tentaremos novamente.';
    }
  }
}

if (checkoutForm) {
  checkoutForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (submitting) return;

    clearError();

    if (!activeProductId || !PRODUCTS[activeProductId]) {
      showError('Selecione um produto antes de continuar.');
      return;
    }

    const formData = new FormData(checkoutForm);
    const customerName = String(
      formData.get('name') || formData.get('nome') || ''
    ).trim();

    const customerEmail = String(
      formData.get('email') || ''
    ).trim();

    const customerDocument = String(
      formData.get('document') ||
      formData.get('cpf') ||
      formData.get('documento') ||
      ''
    ).trim();

    if (!customerName || !customerEmail) {
      showError('Preencha seu nome e e-mail.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(`${API_BASE}/api/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productId: activeProductId,
          customerName,
          customerEmail,
          payerDocument: customerDocument
        })
      });

      const data = await readResponse(response);

      activeOrderId = getOrderId(data);
      const code = getPixCode(data);

      if (!activeOrderId || !code) {
        console.error('Resposta recebida do checkout:', data);
        throw new Error(
          'O servidor respondeu, mas não retornou o identificador do pedido e o código PIX esperado. Precisamos conferir o formato da resposta do backend.'
        );
      }

      if (pixCode) {
        if ('value' in pixCode) {
          pixCode.value = code;
        } else {
          pixCode.textContent = code;
        }
      }

      if (pixSummary) {
        pixSummary.textContent =
          `${PRODUCTS[activeProductId].name} — ${formatPrice(PRODUCTS[activeProductId].price)}`;
      }

      if (pixResult) {
        pixResult.hidden = false;
      }

      if (paymentStatus) {
        paymentStatus.textContent =
          'PIX criado. Após pagar, aguarde a confirmação.';
      }

      stopStatusPolling();
      statusTimer = setInterval(checkPaymentStatus, 5000);
      checkPaymentStatus();
    } catch (error) {
      console.error('Erro no checkout:', error);
      showError(
        error.message ||
        'Não foi possível iniciar o checkout. Tente novamente mais tarde.'
      );
    } finally {
      setSubmitting(false);
    }
  });
}

const copyPixButton = document.querySelector('#copy-pix');

if (copyPixButton) {
  copyPixButton.addEventListener('click', async () => {
    const code = pixCode
      ? ('value' in pixCode ? pixCode.value : pixCode.textContent).trim()
      : '';

    if (!code) {
      showError('O código PIX ainda não está disponível.');
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      copyPixButton.textContent = 'PIX copiado!';

      setTimeout(() => {
        copyPixButton.textContent = 'Copiar código PIX';
      }, 2000);
    } catch {
      showError(
        'Não foi possível copiar automaticamente. Selecione e copie o código PIX manualmente.'
      );
    }
  });
}

if (checkoutDialog) {
  checkoutDialog.addEventListener('close', stopStatusPolling);
}

window.addEventListener('beforeunload', stopStatusPolling);