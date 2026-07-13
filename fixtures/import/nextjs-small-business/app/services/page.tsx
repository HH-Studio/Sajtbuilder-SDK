const services = ["Safety tune-up", "Flat tyre repair", "Cargo bike service"];
export default function Services() { return <section><h1>Services</h1><ul>{services.map((service) => <li key={service}>{service}</li>)}</ul></section>; }
