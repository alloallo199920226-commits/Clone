import { AmountSummary, OceanPage, PaymentForm } from './_OceanPage';

export function Payment() {
  return (
    <OceanPage title="Rechargez, puis reprenez la mer.">
      <section className="ocean-pay__content" aria-label="Formulaire de recharge">
        <AmountSummary />
        <PaymentForm />
      </section>
    </OceanPage>
  );
}

export default Payment;
