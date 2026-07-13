import Image from "next/image";
import { BusinessFacts } from "../components/BusinessFacts";

export default function Home() {
  return <><section className="hero"><div><h1>Reliable bicycle repair in Northstar</h1><p>Same-week service for commuters and families.</p><a href="/booking">Book a repair</a></div><Image src="/workshop.svg" alt="Illustrated bicycle workshop" width={640} height={420} /></section><BusinessFacts /></>;
}
