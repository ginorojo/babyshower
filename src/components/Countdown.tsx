import React, { useState, useEffect } from 'react';

// Fecha objetivo del evento: sábado 10 de Octubre de 2026 a las 16:00 hrs.
// Si cambias esta fecha, acuérdate de cambiar también el texto de
// src/pages/index.astro (sección "¿cuándo?").
const TARGET_DATE = new Date('2026-10-10T16:00:00');

export default function Countdown() {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isCompleted: false
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +TARGET_DATE - +new Date();
      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isCompleted: true });
        return;
      }

      setTimeLeft({
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
        isCompleted: false
      });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, []);

  if (timeLeft.isCompleted) {
    return (
      <div className="text-center py-2 text-[#826c4f]">
        <p className="text-xs font-bold tracking-widest uppercase">¡El gran día ha llegado!</p>
      </div>
    );
  }

  const formatNumber = (num: number) => String(num).padStart(2, '0');

  return (
    <div className="w-full text-center text-[#826c4f] mt-4">
      <div className="flex justify-center items-center gap-2 md:gap-3">
        {[
          { label: 'Días', value: timeLeft.days },
          { label: 'Horas', value: timeLeft.hours },
          { label: 'Min', value: timeLeft.minutes },
          { label: 'Seg', value: timeLeft.seconds },
        ].map((item, index) => (
          <React.Fragment key={item.label}>
            <div className="flex flex-col items-center min-w-[48px] p-1.5 bg-[#826c4f]/5 border border-[#826c4f]/15 rounded-lg shadow-sm">
              <span className="text-lg md:text-xl font-light font-serif leading-tight">{formatNumber(item.value)}</span>
              <span className="text-[8px] uppercase tracking-wider font-bold mt-0.5 opacity-80">{item.label}</span>
            </div>
            {index < 3 && <span className="text-base font-light opacity-40">:</span>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
