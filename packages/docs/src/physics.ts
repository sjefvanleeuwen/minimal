import { mat4, vec3 } from 'gl-matrix';

export class PlanetaryPhysics {
    axialTilt = 0.41;
    landerTheta = Math.PI / 2;
    landerPhi = 0;
    flipped = false;
    planetRadius = 4.0;

    update(dt: number, inputs: { forward: boolean, back: boolean, left: boolean, right: boolean }) {
        const speed = 0.05 * dt * 60; // Normalize by frame rate
        const currentSpeed = this.flipped ? -speed : speed;

        if (inputs.forward) this.landerTheta += currentSpeed;
        if (inputs.back) this.landerTheta -= currentSpeed;
        if (inputs.left) this.landerPhi += speed;
        if (inputs.right) this.landerPhi -= speed;

        if (this.landerTheta < 0) {
            this.landerTheta = -this.landerTheta;
            this.landerPhi += Math.PI;
            this.flipped = !this.flipped;
        } else if (this.landerTheta > Math.PI) {
            this.landerTheta = 2 * Math.PI - this.landerTheta;
            this.landerPhi += Math.PI;
            this.flipped = !this.flipped;
        }

        this.landerPhi = ((this.landerPhi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    }

    getLanderPosition(): vec3 {
        return vec3.fromValues(
            this.planetRadius * Math.sin(this.landerTheta) * Math.cos(this.landerPhi),
            this.planetRadius * Math.cos(this.landerTheta),
            this.planetRadius * Math.sin(this.landerTheta) * Math.sin(this.landerPhi)
        );
    }

    getLanderOrientation(): mat4 {
        const lx = this.planetRadius * Math.sin(this.landerTheta) * Math.cos(this.landerPhi);
        const ly = this.planetRadius * Math.cos(this.landerTheta);
        const lz = this.planetRadius * Math.sin(this.landerTheta) * Math.sin(this.landerPhi);

        const up = vec3.fromValues(lx, ly, lz);
        vec3.normalize(up, up);
        const fwd = vec3.fromValues(
            Math.cos(this.landerTheta) * Math.cos(this.landerPhi),
            -Math.sin(this.landerTheta),
            Math.cos(this.landerTheta) * Math.sin(this.landerPhi)
        );
        vec3.normalize(fwd, fwd);
        const right = vec3.create();
        vec3.cross(right, up, fwd);

        const m = mat4.create();
        m[0]=right[0]; m[1]=right[1]; m[2]=right[2];
        m[4]=up[0];    m[5]=up[1];    m[6]=up[2];
        m[8]=-fwd[0];  m[9]=-fwd[1];  m[10]=-fwd[2];
        m[12]=lx;      m[13]=ly;      m[14]=lz;
        return m;
    }
}
