let promise = null;

export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!promise) {
    promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(window.Razorpay);
      script.onerror = () => {
        promise = null;
        reject(new Error('Failed to load Razorpay checkout. Check your internet connection.'));
      };
      document.body.appendChild(script);
    });
  }
  return promise;
}
