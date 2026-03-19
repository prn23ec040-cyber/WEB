/* script.js - JavaScript functionality for ECE Tech Fest */

document.addEventListener('DOMContentLoaded', () => {
    /* =========================================================================
       0. INTERACTIVE INTRO — 3D Hologram Particle Reveal (Three.js + GSAP)
       ========================================================================= */
    const overlay      = document.getElementById('hero-overlay');
    const canvas3d     = document.getElementById('intro-3d-canvas');
    const enterPrompt  = document.getElementById('enter-prompt');
    const revealItems  = document.querySelectorAll('.reveal-item');
    
    // Check if Three.js is loaded
    if (typeof THREE !== 'undefined' && canvas3d) {
        
        // Basic mobile detection for performance optimization
        const isMobile = window.innerWidth < 768 || /Mobi|Android/i.test(navigator.userAgent);

        // --- 1. Scene, Camera, Renderer ---
        const scene = new THREE.Scene();
        // Optional subtle fog for depth
        scene.fog = new THREE.FogExp2(0x0a0202, 0.0015);
        
        const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 3000);
        
        // Camera can be much closer on mobile now since we wrap the text into two lines
        camera.position.z = isMobile ? 700 : 400;
        
        const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, alpha: true, antialias: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        
        // Cap pixel ratio on mobile to drastically save GPU overhead
        renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.25) : Math.min(window.devicePixelRatio, 2));

        // --- 2. Generate Particles from 2D Canvas offscreen ---
        // We render the text "EARNEST" onto a hidden 2D canvas and sample its pixels to get 3D coords
        const textCanvas = document.createElement('canvas');
        const tCtx = textCanvas.getContext('2d');
        
        // Size of the virtual canvas we're sampling from (taller on mobile to fit 2 lines)
        const tWidth = 800;
        const tHeight = isMobile ? 400 : 250;
        textCanvas.width = tWidth;
        textCanvas.height = tHeight;
        
        tCtx.fillStyle = '#ffffff';
        // Using a bold, impactful font
        tCtx.font = 'bold 140px "Orbitron", "Share Tech Mono", sans-serif';
        tCtx.textAlign = 'center';
        tCtx.textBaseline = 'middle';
        
        if (isMobile) {
            // Split "EARNEST" into 2 lines for mobile
            tCtx.fillText('EARN', tWidth / 2, tHeight / 2 - 65);
            tCtx.fillText('EST', tWidth / 2, tHeight / 2 + 65);
        } else {
            tCtx.fillText('EARNEST', tWidth / 2, tHeight / 2);
        }
        
        const imgData = tCtx.getImageData(0, 0, tWidth, tHeight).data;
        
        const particles = [];
        const colors = [];
        const color = new THREE.Color();
        
        // Sampling gap dictates particle count. 
        // 4 is high-res (desktop), 7 is low-res (perfect for mobile to keep 60fps).
        const gap = isMobile ? 7 : 4;
        
        for (let y = 0; y < tHeight; y += gap) {
            for (let x = 0; x < tWidth; x += gap) {
                const index = (y * tWidth + x) * 4;
                const alpha = imgData[index + 3];
                
                // If pixel is not transparent, it's part of the text
                if (alpha > 128) {
                    // Center the coordinates around 0,0
                    const pX = x - (tWidth / 2);
                    const pY = -(y - (tHeight / 2));
                    // Add random depth (Z) to make it a 3D cloud
                    const pZ = (Math.random() - 0.5) * 80;
                    
                    particles.push(pX, pY, pZ);
                    
                    // Assign a color based on its X position to create a gradient (Gold #ffcc00 to Red #ff3333)
                    const normalizedX = x / tWidth;
                    color.lerpColors(new THREE.Color(0xffcc00), new THREE.Color(0xff3333), normalizedX);
                    // Add a tiny bit of random brightness variation
                    color.multiplyScalar(0.8 + Math.random() * 0.4);
                    colors.push(color.r, color.g, color.b);
                }
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(particles, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        // Store the original positions so particles know where to return to after being pushed
        const originalPositions = new Float32Array(particles);
        geometry.setAttribute('originalPosition', new THREE.BufferAttribute(originalPositions, 3));
        
        // Compensate for fewer particles (and the camera being further back) on mobile by making them larger
        const particleSize = isMobile ? 10 : 3;

        // Use a nice glowing additive blending material for the points
        const material = new THREE.PointsMaterial({
            size: particleSize,
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        const particleSystem = new THREE.Points(geometry, material);
        scene.add(particleSystem);
        
        // --- 3. Interaction & Animation ---
        let mouseX = 0;
        let mouseY = 0;
        let isWarping = false;
        
        // Track mouse/touch normalized (-1 to 1) for parallax
        const handleMove = (x, y) => {
            if (isWarping) return;
            mouseX = (x / window.innerWidth) * 2 - 1;
            mouseY = -(y / window.innerHeight) * 2 + 1;
            
            // GSAP to smoothly rotate the entire particle cloud
            if (typeof gsap !== 'undefined') {
                gsap.to(particleSystem.rotation, {
                    x: -mouseY * 0.4, // tilt up/down
                    y: mouseX * 0.4,  // pan left/right
                    duration: 1.5,
                    ease: "power2.out"
                });
            } else {
                particleSystem.rotation.x = -mouseY * 0.4;
                particleSystem.rotation.y = mouseX * 0.4;
            }
        };

        window.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY), { passive: true });
        window.addEventListener('touchmove', (e) => handleMove(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }, { passive: true });
        
        // --- 4. The Render Loop (Physics & Drawing) ---
        const clock = new THREE.Clock();
        
        function animate() {
            requestAnimationFrame(animate);
            
            if (!isWarping) {
                const positions = particleSystem.geometry.attributes.position.array;
                const originals = particleSystem.geometry.attributes.originalPosition.array;
                
                // Add a very slow idle breathing animation
                const time = clock.getElapsedTime();
                
                // Interactive Physics: particles repel from the projected 2D mouse cursor 
                const mappedMouseX = mouseX * (window.innerWidth / 3);
                const mappedMouseY = mouseY * (window.innerHeight / 3);
                
                for (let i = 0; i < positions.length; i += 3) {
                    let px = positions[i];
                    let py = positions[i+1];
                    let pz = positions[i+2];
                    
                    const ox = originals[i];
                    const oy = originals[i+1];
                    const oz = originals[i+2];
                    
                    const dx = px - mappedMouseX;
                    const dy = py - mappedMouseY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    const influenceRadius = 120;
                    
                    if (dist < influenceRadius) {
                        // Repel outwards and slightly towards camera
                        const force = (influenceRadius - dist) / influenceRadius;
                        px += (dx / dist) * force * 4;
                        py += (dy / dist) * force * 4;
                        pz += force * 15; 
                    } else {
                        // Spring back with subtle idle float wave
                        const floatWave = Math.sin(time * 2 + ox * 0.01) * 2;
                        px += (ox - px) * 0.05;
                        py += (oy - py) * 0.05;
                        pz += (oz + floatWave - pz) * 0.05;
                    }
                    
                    positions[i] = px;
                    positions[i+1] = py;
                    positions[i+2] = pz;
                }
                particleSystem.geometry.attributes.position.needsUpdate = true;
            }
            
            renderer.render(scene, camera);
        }
        
        // Start rendering
        animate();
        
        // --- 5. Warp Drive Entry Sequence ---
        function exitIntro() {
            if (isWarping || typeof gsap === 'undefined') return;
            isWarping = true;
            
            enterPrompt.classList.remove('visible');
            
            // Warp the intro logo towards the camera
            const topLogo = document.getElementById('intro-top-logo');
            if (topLogo) {
                gsap.to(topLogo, {
                    scale: 4,
                    opacity: 0,
                    filter: 'drop-shadow(0 0 50px rgba(255,204,0,1))',
                    duration: 1.5,
                    ease: "power2.in"
                });
            }
            
            document.body.style.overflow = 'hidden'; 
            
            // Camera accelerates past the text (Z=0)
            gsap.to(camera.position, {
                z: -300, 
                duration: 1.8,
                ease: "power3.in"
            });
            
            // Stretch the particles to simulate motion blur/stars
            gsap.to(material, {
                size: 20,
                opacity: 0.1,
                duration: 1.5,
                ease: "power2.in"
            });
            
            // Fade out the overlay right as camera passes through the text
            gsap.to(overlay, {
                opacity: 0,
                duration: 0.8,
                delay: 1.4,
                onComplete: () => {
                    overlay.style.display = 'none';
                    document.body.style.overflow = '';
                    revealItems.forEach(item => item.classList.add('is-visible'));
                    
                    // Clean memory to ensure site stays highly performant
                    renderer.dispose();
                    geometry.dispose();
                    material.dispose();
                }
            });
        }
        
        // Triggers for exit
        overlay.addEventListener('click', exitIntro);
        overlay.addEventListener('touchend', (e) => { 
            // Only trigger if we aren't likely scrolling
            if (e.target.id === 'intro-3d-canvas') {
                e.preventDefault(); 
                exitIntro();
            }
        }, { passive: false });
        overlay.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > 10) exitIntro(); }, { passive: true });
        
        let touchStartY = 0;
        overlay.addEventListener('touchstart', (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
        overlay.addEventListener('touchmove', (e) => {
            if (Math.abs(touchStartY - e.touches[0].clientY) > 30) {
                exitIntro();
            }
        }, { passive: true });
        
        // Show prompt after a short delay
        setTimeout(() => {
            if(!isWarping) enterPrompt.classList.add('visible');
        }, 3000);

    } else {
        // Fallback if ThreeJS fails to load
        overlay.style.display = 'none';
        revealItems.forEach(item => item.classList.add('is-visible'));
    }


    /* =========================================================================
       1. Sticky Navigation Bar
       ========================================================================= */
    const navbar = document.getElementById('navbar');
    
    // Add background color to navbar when scrolling down
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    /* =========================================================================
       2. Mobile Menu Toggle
       ========================================================================= */
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    const icon = hamburger.querySelector('i');
    
    // Toggle the mobile menu on click
    hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        
        // Swap hamburger and close icons based on state
        if(navLinks.classList.contains('active')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    });

    /* =========================================================================
       3. Smooth Scrolling for Navigation Links & Closing Mobile Menu
       ========================================================================= */
    const navItems = document.querySelectorAll('.nav-links a');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Close the mobile menu on item click
            if (navLinks.classList.contains('active')) {
                navLinks.classList.remove('active');
                icon.classList.remove('fa-times');
                icon.classList.add('fa-bars');
            }
        });
    });

    /* =========================================================================
       4. Subtly Animate Elements on Scroll (Optional but recommended for modern feel)
       ========================================================================= */
    // Simple intersection observer to add a class when elements enter viewport
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if(entry.isIntersecting) {
                // If it's a staggered reveal container (like the stats grid), reveal its children
                if (entry.target.classList.contains('staggered-reveal')) {
                    const items = entry.target.querySelectorAll('.reveal-item');
                    items.forEach((item, index) => {
                        setTimeout(() => {
                            item.classList.add('is-visible');
                        }, index * 150); // Stagger the animation
                    });
                } else {
                    // Normal single element reveal
                    entry.target.classList.add('visible');
                }
                
                // Unobserve after animating once
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Select elements to animate
    document.querySelectorAll('.workshop-card, .section-header, .staggered-reveal').forEach(el => {
        observer.observe(el);
    });

    /* =========================================================================
       5. Animated Particle Background for Entire Page
       ========================================================================= */
    const canvas = document.getElementById('particles-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        let particlesArray;

        // Set canvas to full window size
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            init();
        });

        class Particle {
            constructor(x, y, directionX, directionY, size, color) {
                this.x = x;
                this.y = y;
                this.directionX = directionX;
                this.directionY = directionY;
                this.size = size;
                this.color = color;
            }
            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
                ctx.fillStyle = '#ffcc00';
                ctx.fill();
            }
            update() {
                if (this.x > canvas.width || this.x < 0) {
                    this.directionX = -this.directionX;
                }
                if (this.y > canvas.height || this.y < 0) {
                    this.directionY = -this.directionY;
                }

                this.x += this.directionX;
                this.y += this.directionY;
                this.draw();
            }
        }

        function init() {
            particlesArray = [];
            let numberOfParticles = (canvas.height * canvas.width) / 12000;
            // Limit the maximum number of particles for performance
            if (numberOfParticles > 100) numberOfParticles = 100;
            
            for (let i = 0; i < numberOfParticles; i++) {
                let size = (Math.random() * 2) + 1;
                let x = (Math.random() * ((canvas.width - size * 2) - (size * 2)) + size * 2);
                let y = (Math.random() * ((canvas.height - size * 2) - (size * 2)) + size * 2);
                // Slower elegant particle motion
                let directionX = (Math.random() * 0.3) - 0.15;
                let directionY = (Math.random() * 0.3) - 0.15;
                let color = '#ffcc00';
                particlesArray.push(new Particle(x, y, directionX, directionY, size, color));
            }
        }

        function animate() {
            requestAnimationFrame(animate);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (let i = 0; i < particlesArray.length; i++) {
                particlesArray[i].update();
            }
            connect();
        }

        function connect() {
            let opacityValue = 1;
            for (let a = 0; a < particlesArray.length; a++) {
                for (let b = a; b < particlesArray.length; b++) {
                    let distance = ((particlesArray[a].x - particlesArray[b].x) * (particlesArray[a].x - particlesArray[b].x)) +
                                   ((particlesArray[a].y - particlesArray[b].y) * (particlesArray[a].y - particlesArray[b].y));
                    
                    if (distance < (canvas.width / 7) * (canvas.height / 7)) {
                        opacityValue = 1 - (distance / 20000);
                        if (opacityValue < 0) opacityValue = 0;
                        ctx.strokeStyle = 'rgba(255, 204, 0,' + opacityValue + ')';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(particlesArray[a].x, particlesArray[a].y);
                        ctx.lineTo(particlesArray[b].x, particlesArray[b].y);
                        ctx.stroke();
                    }
                }
            }
        }

        init();
        animate();
    }
    
    /* =========================================================================
       6. Interactive Elements (Mobile Tilt & Ripples)
       ========================================================================= */
    const cards = document.querySelectorAll('.ragam-card, .game-card');
    
    // 3D Tilt Effect based on Device Orientation (Mobile)
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', (e) => {
            if (e.gamma === null || e.beta === null) return;
            
            // Constrain angles to prevent flipping (-45 to 45 degrees)
            const gamma = Math.max(-45, Math.min(45, e.gamma)); // Left/Right
            const beta = Math.max(-45, Math.min(45, e.beta - 45)); // Up/Down (offset for typical holding angle)

            cards.forEach(card => {
                // Check if card is near the viewport
                const rect = card.getBoundingClientRect();
                if (rect.top < window.innerHeight && rect.bottom > 0) {
                    // Calculate subtle rotation values based on tilt
                    const rotateX = beta * 0.3; // Much more subtle
                    const rotateY = gamma * 0.3;
                    
                    card.style.transform = `perspective(1000px) rotateX(${-rotateX}deg) rotateY(${rotateY}deg) translateY(-2px)`;
                    card.style.boxShadow = `${-gamma * 0.2}px ${-beta * 0.2 + 10}px 25px rgba(255, 204, 0, 0.15)`;
                }
            });
        }, { passive: true });
    }

    // Reset transform on scroll to keep it clean if user stops holding phone flat
    window.addEventListener('scroll', () => {
        cards.forEach(card => card.style.transform = '');
    }, { passive: true });

    // Touch Ripple Effect for Buttons and Cards
    const rippleElements = document.querySelectorAll('.btn, .ragam-card-bottom, .btn-game');
    rippleElements.forEach(el => {
        el.addEventListener('touchstart', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.touches[0].clientX - rect.left;
            const y = e.touches[0].clientY - rect.top;
            
            const ripple = document.createElement('span');
            ripple.style.position = 'absolute';
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
            ripple.style.width = '2px';
            ripple.style.height = '2px';
            ripple.style.background = 'rgba(255, 255, 255, 0.4)';
            ripple.style.borderRadius = '50%';
            ripple.style.transform = 'translate(-50%, -50%)';
            ripple.style.pointerEvents = 'none';
            ripple.style.animation = 'ripple-effect 0.6s linear';
            
            // Ensure parent allows relative positioning and hides overflow
            if(window.getComputedStyle(this).position === 'static') {
                this.style.position = 'relative';
            }
            this.style.overflow = 'hidden';
            
            this.appendChild(ripple);
            
            setTimeout(() => {
                if(ripple.parentNode === this) {
                    ripple.remove();
                }
            }, 600);
        }, { passive: true });
    });

});
